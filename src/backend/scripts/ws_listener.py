#!/usr/bin/env python3
import json
import asyncio
import argparse
import signal
import os
from uuid import UUID
from datetime import datetime
import sys
from pathlib import Path
from dotenv import load_dotenv

# Add the parent directory to the path so we can import from modules
sys.path.append(str(Path(__file__).parent.parent))

from redis import asyncio as aioredis
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.syntax import Syntax
from rich.markdown import Markdown
from rich import box

# Load environment variables from .env file
env_path = Path(__file__).parent.parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

console = Console()

# Handle graceful shutdown
shutdown_event = asyncio.Event()

def handle_exit():
    console.print("[yellow]Shutting down...[/yellow]")
    shutdown_event.set()

async def get_redis_client():
    """Get Redis client using configuration from .env file."""
    redis_password = os.getenv("REDIS_PASSWORD", "pad")
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", 6379))
    
    redis_url = f"redis://:{redis_password}@{redis_host}:{redis_port}/0"
    console.print(f"[dim]Connecting to Redis at {redis_host}:{redis_port}[/dim]")
    
    try:
        redis_client = await aioredis.from_url(redis_url)
        # Test connection
        await redis_client.ping()
        console.print("[green]Redis connection established[/green]")
        return redis_client
    except Exception as e:
        console.print(f"[red]Failed to connect to Redis:[/red] {str(e)}")
        raise

# Store pad content globally to track changes
pad_content = {}

async def connect_to_pad_stream(pad_id: UUID, from_start: bool = False):
    """Connect to Redis and listen for pad events."""
    stream_key = f"pad:stream:{pad_id}"
    console.print(f"[bold]Listening to Redis stream:[/bold] {stream_key}")
    
    try:
        redis_client = await get_redis_client()
        # Start from the beginning of the stream if requested, otherwise start from latest
        last_id = "0" if from_start else "$"
        
        # Set up signal handlers
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, handle_exit)
        
        # Store the current pad content
        pad_content[str(pad_id)] = ""
        
        while not shutdown_event.is_set():
            try:
                # Read messages from the Redis stream
                streams = await redis_client.xread({stream_key: last_id}, count=5, block=1000)
                
                if streams:
                    stream_name, stream_messages = streams[0]
                    for message_id, message_data_raw in stream_messages:
                        # Convert raw Redis data to a formatted dictionary
                        formatted_message = {}
                        for k, v in message_data_raw.items():
                            key = k.decode() if isinstance(k, bytes) else k
                            if isinstance(v, bytes):
                                value = v.decode()
                            else:
                                value = v
                            formatted_message[key] = value
                        
                        # If this is a pad_update, update our stored content
                        if formatted_message.get("type") == "pad_update" and "content" in formatted_message:
                            pad_content[str(pad_id)] = formatted_message["content"]
                        
                        await handle_message(formatted_message, str(pad_id))
                        last_id = message_id
                
                # Release asyncio lock to prevent CPU hogging
                await asyncio.sleep(0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                console.print(f"[red]Error reading from Redis stream:[/red] {str(e)}")
                await asyncio.sleep(1)  # Wait before reconnecting
        
        # Close Redis connection
        await redis_client.close()
        console.print("[yellow]Redis connection closed[/yellow]")
        
    except Exception as e:
        console.print(f"[red]Error in Redis connection:[/red] {str(e)}")

def detect_content_type(content):
    """Try to detect content type for syntax highlighting."""
    if content.startswith("```") and "\n" in content:
        # Possible markdown code block
        lang_line = content.split("\n", 1)[0].strip("`").strip()
        if lang_line in ["python", "javascript", "typescript", "html", "css", "json", "bash", "markdown"]:
            return lang_line
    
    # Look for common patterns
    if "<html" in content and "</html>" in content:
        return "html"
    if "function" in content and ("=>" in content or "{" in content):
        return "javascript"
    if "import " in content and "from " in content and "def " in content:
        return "python"
    if content.strip().startswith("{") and content.strip().endswith("}"):
        try:
            json.loads(content)
            return "json"
        except:
            pass
            
    # Default to plain text
    return "text"

def format_content_for_display(content, content_type=None):
    """Format content appropriately based on detected type."""
    if not content_type:
        content_type = detect_content_type(content)
    
    # If content looks like markdown, render it as markdown
    if content.startswith("#") or "**" in content or "*" in content or "##" in content:
        try:
            return Markdown(content)
        except:
            pass
    
    # Otherwise use syntax highlighting
    return Syntax(content, content_type, theme="monokai", line_numbers=True, word_wrap=True)

async def handle_message(message, pad_id):
    """Process and display received Redis stream messages."""
    try:
        # Extract message type and other common fields
        msg_type = message.get("type", "unknown")
        timestamp = message.get("timestamp", datetime.now().isoformat())
        connection_id = message.get("connection_id", "unknown")[:5]  # First 5 chars
        user_id = message.get("user_id", "unknown")[:5]
        
        # Format timestamp for display
        timestamp_display = timestamp.split('T')[1].split('.')[0] if 'T' in timestamp else timestamp
        
        # Format title based on message type
        title = f"{msg_type} at {timestamp_display} [connection: {connection_id}, user: {user_id}]"
        
        # Create different styles for different event types
        if msg_type == "user_joined":
            title_style = "bold green"
            content = f"User {user_id} joined the pad"
            
        elif msg_type == "user_left":
            title_style = "bold red"
            content = f"User {user_id} left the pad"
            
        elif msg_type == "pad_update":
            title_style = "bold blue"
            if "content" in message:
                # Show the formatted content
                content_text = message["content"]
                
                # Display formatted content
                console.print(Panel(
                    f"User {user_id} updated the pad content",
                    title=Text(title, style=title_style),
                    border_style="blue"
                ))
                
                # Display full content with syntax highlighting
                content_type = detect_content_type(content_text)
                formatted_content = format_content_for_display(content_text, content_type)
                
                console.print(Panel(
                    formatted_content,
                    title=Text(f"Current Pad Content ({content_type})", style="bold cyan"),
                    border_style="cyan",
                    box=box.ROUNDED
                ))
                return
            else:
                content = f"Content updated by user {user_id} (no content provided in event)"
                
        elif msg_type == "connected":
            title_style = "bold cyan"
            content = f"Successfully connected with connection ID: {connection_id}"
            
        else:
            title_style = "bold yellow"
            content = json.dumps(message, indent=2)
        
        # Create and display the panel with message details
        title_text = Text(title, style=title_style)
        console.print(Panel(content, title=title_text, border_style="dim"))
        
    except Exception as e:
        console.print(f"[red]Error handling message:[/red] {str(e)}")

async def main():
    """Main entry point for the pad events listener script."""
    parser = argparse.ArgumentParser(description="Listen to events for a specific pad directly from Redis")
    parser.add_argument("pad_id", help="UUID of the pad to listen to")
    parser.add_argument("--from-start", "-f", action="store_true", 
                      help="Read from the beginning of the stream history")
    
    args = parser.parse_args()
    
    # Validate the pad_id is a valid UUID
    try:
        pad_uuid = UUID(args.pad_id)
    except ValueError:
        console.print("[red]Invalid pad ID. Must be a valid UUID.[/red]")
        return
    
    console.print(f"[bold]Pad Event Listener[/bold] - Connecting to pad: {pad_uuid}")
    
    try:
        await connect_to_pad_stream(pad_uuid, from_start=args.from_start)
    except KeyboardInterrupt:
        handle_exit()
    finally:
        console.print("[yellow]Listener stopped[/yellow]")

if __name__ == "__main__":
    asyncio.run(main()) 