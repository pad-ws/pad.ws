import asyncio
import uuid
import json
from typing import Dict, Any, List, Optional, Tuple, Set
from uuid import UUID
from datetime import datetime

from database.database import async_session
from domain.pad import Pad

SAVE_INTERVAL = 300 # 5 minutes in seconds

class CanvasWorker:
    """
    Background worker that processes canvas updates from Redis streams.
    
    This worker can handle multiple pads dynamically.
    Uses singleton pattern for proper lifecycle management.
    """
    
    _instance = None
    
    @classmethod
    async def get_instance(cls) -> 'CanvasWorker':
        """Get or create a CanvasWorker instance."""
        if cls._instance is None:
            cls._instance = cls()
            await cls._instance.initialize()
        return cls._instance
    
    @classmethod
    async def shutdown_instance(cls) -> None:
        """Shutdown the singleton instance."""
        if cls._instance is not None:
            await cls._instance.stop()
            cls._instance = None
    
    def __init__(self):
        self._redis = None
        self.worker_id = str(uuid.uuid4())
        self._active_pads: Set[UUID] = set()
        self._pad_tasks: Dict[UUID, asyncio.Task] = {}
        self._last_processed_ids: Dict[UUID, str] = {}
        self._periodic_save_tasks: Dict[UUID, asyncio.Task] = {}
    
    async def initialize(self) -> None:
        """Initialize the worker with Redis connection."""
        from cache import RedisClient
        self._redis = await RedisClient.get_instance()
    
    async def stop(self) -> None:
        """Stop the worker and all pad processing tasks."""
        print(f"Stopping Canvas worker {self.worker_id[:8]}")
        
        for pad_id in list(self._active_pads):
            await self.stop_processing_pad(pad_id, graceful=True)
    
    async def start_processing_pad(self, pad_id: UUID) -> bool:
        """Start processing updates for a specific pad."""
        if pad_id in self._active_pads:
            return True  # Already processing
            
        print(f"Worker {self.worker_id[:8]} starting to process pad {pad_id}")
        
        # Add to active pads and start task
        self._active_pads.add(pad_id)
        task = asyncio.create_task(self._process_pad_updates(pad_id))
        self._pad_tasks[pad_id] = task
        
        # Start periodic save task
        save_task = asyncio.create_task(self._periodic_save_to_db(pad_id))
        self._periodic_save_tasks[pad_id] = save_task
        
        # Set up task cleanup on completion
        def cleanup_task(task_ref):
            if pad_id in self._active_pads:
                self._active_pads.remove(pad_id)
            if pad_id in self._pad_tasks:
                del self._pad_tasks[pad_id]
        
        def cleanup_save_task(task_ref):
            if pad_id in self._periodic_save_tasks:
                del self._periodic_save_tasks[pad_id]
        
        task.add_done_callback(cleanup_task)
        save_task.add_done_callback(cleanup_save_task)
        return True
    
    async def stop_processing_pad(self, pad_id: UUID, graceful: bool = True) -> None:
        """Stop processing updates for a specific pad."""
        if pad_id not in self._active_pads:
            return
            
        print(f"Worker {self.worker_id[:8]} stopping processing for pad {pad_id} {'gracefully' if graceful else ''}")
        
        if graceful:
            # Graceful shutdown: remove from active pads and let the task finish naturally
            self._active_pads.discard(pad_id)
            
            # Stop the periodic save task
            if pad_id in self._periodic_save_tasks:
                save_task = self._periodic_save_tasks[pad_id]
                save_task.cancel()
                try:
                    await save_task
                except asyncio.CancelledError:
                    pass
            
            # Perform final save to database before stopping
            await self._save_pad(pad_id)
            
            # Wait for the task to complete naturally (it will exit the while loop)
            if pad_id in self._pad_tasks:
                task = self._pad_tasks[pad_id]
                try:
                    # Give it a reasonable time to finish processing
                    await asyncio.wait_for(task, timeout=10.0)
                    print(f"Gracefully stopped processing for pad {pad_id}")
                except asyncio.TimeoutError:
                    print(f"Timeout waiting for graceful shutdown of pad {pad_id}, forcing cancellation")
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                except asyncio.CancelledError:
                    print(f"Processing task for pad {pad_id} was cancelled during graceful shutdown")
                    pass
        else:
            # Immediate shutdown: cancel the tasks
            if pad_id in self._periodic_save_tasks:
                save_task = self._periodic_save_tasks[pad_id]
                save_task.cancel()
                try:
                    await save_task
                except asyncio.CancelledError:
                    pass
            
            if pad_id in self._pad_tasks:
                task = self._pad_tasks[pad_id]
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    print(f"Processing task for pad {pad_id} was cancelled")
                    pass
            
            self._active_pads.discard(pad_id)
        
        # Clean up task references
        self._pad_tasks.pop(pad_id, None)
        self._periodic_save_tasks.pop(pad_id, None)
        
        await self._release_pad_worker(pad_id)
    
    async def _release_pad_worker(self, pad_id: UUID) -> None:
        """Release the worker assignment for a pad."""
        try:
            # Get the pad using proper session management and clear the worker assignment
            async with async_session() as session:
                pad = await Pad.get_by_id(session, pad_id)
                
                if pad and pad.worker_id == self.worker_id:
                    # Only clear if this worker is actually assigned to the pad
                    pad.worker_id = None
                    await pad.cache()
                    print(f"Released worker assignment for pad {pad_id}")
            
            # Clean up the in-memory tracking
            self._last_processed_ids.pop(pad_id, None)
            print(f"Cleaned up in-memory tracking for pad {pad_id}")
            
        except Exception as e:
            print(f"Error releasing worker assignment for pad {pad_id}: {e}")
    
    async def _process_pad_updates(self, pad_id: UUID) -> None:
        """Process updates for a specific pad."""
        stream_key = f"pad:stream:{pad_id}"
        last_id = "$"  # Only process new messages for this worker session
        
        try:
            while pad_id in self._active_pads:
                try:
                    # Read from Redis stream
                    streams = await self._redis.xread({stream_key: last_id}, count=10, block=5000)
                    
                    if not streams:
                        await asyncio.sleep(0)
                        continue
                        
                    stream_name, stream_messages = streams[0]
                    
                    for message_id, message_data in stream_messages:
                        try:
                            # Process the message
                            await self._process_message(pad_id, message_id, message_data)
                            
                            # Update last processed ID in memory
                            self._last_processed_ids[pad_id] = message_id.decode() if isinstance(message_id, bytes) else message_id
                        except Exception as e:
                            print(f"Error processing message for pad {pad_id}: {e}")
                            
                        # Update last ID
                        last_id = message_id
                except asyncio.CancelledError:
                    print(f"Processing task for pad {pad_id} was cancelled")
                    raise
                except Exception as e:
                    print(f"Error reading stream for pad {pad_id}: {e}")
                    await asyncio.sleep(1)
            
            # Graceful shutdown: process any remaining messages before exiting
            try:
                # Process any remaining messages with a shorter timeout
                streams = await self._redis.xread({stream_key: last_id}, count=50, block=1000)
                
                if streams:
                    stream_name, stream_messages = streams[0]
                    print(f"Processing {len(stream_messages)} remaining messages for pad {pad_id}")
                    
                    for message_id, message_data in stream_messages:
                        try:
                            await self._process_message(pad_id, message_id, message_data)
                            # Update last processed ID for final messages too
                            self._last_processed_ids[pad_id] = message_id.decode() if isinstance(message_id, bytes) else message_id
                        except Exception as e:
                            print(f"Error processing final message for pad {pad_id}: {e}")
                    
            except Exception as e:
                print(f"Error processing remaining messages for pad {pad_id}: {e}")
                
        except asyncio.CancelledError:
            print(f"Processing task for pad {pad_id} was cancelled")
        finally:
            print(f"Stopped processing updates for pad {pad_id}")
    
    async def _process_message(self, pad_id: UUID, message_id: bytes, message_data: Dict[bytes, bytes]) -> None:
        """Process a message from the Redis stream."""
        # Convert bytes keys/values to strings
        data = {}
        for k, v in message_data.items():
            key = k.decode() if isinstance(k, bytes) else k
            value = v.decode() if isinstance(v, bytes) else v
            
            # Parse 'data' field if it's JSON
            if key == 'data':
                try:
                    data[key] = json.loads(value)
                except json.JSONDecodeError:
                    data[key] = value
            else:
                data[key] = value
                
        message_type = data.get('type')
        message_data = data.get('data')
        
        if message_type == 'scene_update' and message_data:
            await self.handle_scene_update(
                pad_id=pad_id,
                data=message_data
            )
        elif message_type == 'appstate_update' and message_data:
            await self.handle_appstate_update(
                pad_id=pad_id,
                user_id=data.get('user_id'),
                data=message_data
            )
    
    async def handle_scene_update(
        self, 
        pad_id: UUID,
        data: Dict[str, Any]
    ) -> None:
        """Handle a scene_update message from a client."""
        try:
            async with async_session() as session:
                pad = await Pad.get_by_id(session, pad_id)
                if not pad:
                    print(f"Pad {pad_id} not found for scene update")
                    return
                
                client_elements = data.get("elements", [])
                client_files = data.get("files", {})
                
                changes_made = False
                
                # Update files if needed
                if client_files and client_files != pad.data.get("files", {}):
                    pad.data["files"] = client_files
                    changes_made = True
                
                # Reconcile elements if needed
                if client_elements:
                    current_elements = pad.data.get("elements", [])
                    reconciled_elements, elements_changed = self._reconcile_elements(current_elements, client_elements)
                    if elements_changed:
                        pad.data["elements"] = reconciled_elements
                        changes_made = True
                        
                if changes_made:
                    await pad.cache()
                
        except Exception as e:
            print(f"Error handling scene update for pad {pad_id}: {e}")

    async def handle_appstate_update(
        self, 
        pad_id: UUID,
        user_id: str,
        data: Dict[str, Any]
    ) -> None:
        """Handle an appstate_update message from a client. Last writer wins for entire appState."""
        try:
            new_appstate = data.get("appState", {})
            
            if not new_appstate:
                return
            
            async with async_session() as session:
                pad = await Pad.get_by_id(session, pad_id)
                if not pad:
                    print(f"Pad {pad_id} not found for appstate update")
                    return
                    
                # Update the user's appState (last writer wins - replace entirely)
                if "appState" not in pad.data:
                    pad.data["appState"] = {}
                    
                pad.data["appState"][user_id] = new_appstate
                
                await pad.cache()
            
        except Exception as e:
            print(f"Error handling appstate update for pad {pad_id}, user {user_id}: {e}")
    
    def _reconcile_elements(
        self, 
        server_elements: List[Dict[str, Any]],
        client_elements: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], bool]:
        """
        Reconcile incoming elements with current server state.
        
        Returns:
            Tuple of (reconciled_elements, has_changes)
        """
        # Map server elements by ID for quick lookup
        server_elements_map = {elem["id"]: elem for elem in server_elements}
        reconciled_elements = []
        processed_ids = set()
        has_changes = False
        
        # Process client elements first
        for client_elem in client_elements:
            elem_id = client_elem.get("id")
            if not elem_id or elem_id in processed_ids:
                continue
                
            server_elem = server_elements_map.get(elem_id)
            
            # Determine if we should keep server or client version
            if self._should_discard_client_element(server_elem, client_elem):
                reconciled_elements.append(server_elem)
            else:
                reconciled_elements.append(client_elem)
                # Check if there was an actual change
                if not server_elem or client_elem != server_elem:
                    has_changes = True
                    
            processed_ids.add(elem_id)
            
        # Add remaining server elements
        for elem_id, server_elem in server_elements_map.items():
            if elem_id not in processed_ids:
                reconciled_elements.append(server_elem)
                
        # Order elements by fractional index
        ordered_elements = self._order_by_fractional_index(reconciled_elements)
        
        return ordered_elements, has_changes
    
    def _should_discard_client_element(
        self,
        server_element: Optional[Dict[str, Any]],
        client_element: Dict[str, Any]
    ) -> bool:
        """
        Determine if a client element should be discarded in favor of server version.
        """
        if not server_element:
            # No server version, accept client version
            return False
            
        # Get versions for comparison
        server_version = server_element.get("version", 0)
        client_version = client_element.get("version", 0)
        
        # Compare versions - higher version wins
        if client_version < server_version:
            return True
            
        if client_version > server_version:
            return False
            
        # If versions are equal, use versionNonce as tie-breaker
        server_nonce = server_element.get("versionNonce", 0)
        client_nonce = client_element.get("versionNonce", 0)
        
        # Lower nonce wins (same behavior as Excalidraw frontend)
        return client_nonce > server_nonce
    
    def _order_by_fractional_index(self, elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sort elements by their fractional index."""
        def get_sort_key(elem):
            index = elem.get("index")
            if not index:
                return ("", elem.get("id", ""))
            return (index, elem.get("id", ""))
            
        return sorted(elements, key=get_sort_key)
    
    async def _periodic_save_to_db(self, pad_id: UUID) -> None:
        """Periodically save pad data to database every 5 minutes."""
        try:
            while pad_id in self._active_pads:
                await asyncio.sleep(SAVE_INTERVAL)
                
                # Only save if pad is still active
                if pad_id in self._active_pads:
                    await self._save_pad(pad_id)
                    
        except asyncio.CancelledError:
            print(f"Periodic save task for pad {pad_id} was cancelled")
        except Exception as e:
            print(f"Error in periodic save for pad {pad_id}: {e}")
    
    async def _save_pad(self, pad_id: UUID) -> bool:
        """Save pad data using the Pad domain class."""
        try:
            # Create database session and save using Pad domain
            async with async_session() as session:
                # Get the pad from database (this will also check cache first)
                pad = await Pad.get_by_id(session, pad_id)
                
                if not pad:
                    print(f"Pad {pad_id} not found in database, skipping save")
                    return False
                
                await pad.save(session)
                return True
                
        except Exception as e:
            print(f"Error saving pad {pad_id} to database via domain: {e}")
            return False