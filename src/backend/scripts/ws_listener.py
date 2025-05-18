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
import io

# Add the parent directory to the path so we can import from modules
sys.path.append(str(Path(__file__).parent.parent))

from redis import asyncio as aioredis
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.syntax import Syntax
from rich.markdown import Markdown
from rich import box
from rich.tree import Tree
from rich.json import JSON
from rich.console import RenderableType

from textual.app import App, ComposeResult
from textual.containers import Container, ScrollableContainer
from textual.widgets import Header, Footer, Button, Static
from textual.reactive import reactive
from textual import work

# Load environment variables from .env file
env_path = Path(__file__).parent.parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

console = Console()

# For non-Textual output during setup
setup_console = Console()

class PadUpdateWidget(Static):
    """A widget to display an individual pad update with expandable content."""
    
    def __init__(self, message, **kwargs):
        super().__init__("", **kwargs)
        self.message = message
        # Parse data field if it exists and appears to be JSON
        if "data" in self.message and isinstance(self.message["data"], str):
            try:
                if self.message["data"].startswith("{") or self.message["data"].startswith("["):
                    self.message["data"] = json.loads(self.message["data"])
            except json.JSONDecodeError:
                pass  # Keep as string if it can't be parsed
        self.expanded = False
        self.update_display()
    
    def render_rich_tree(self, tree: Tree) -> str:
        """Properly render a Rich Tree to a string."""
        # Create a string buffer and a console to render into it
        string_io = io.StringIO()
        temp_console = Console(file=string_io, width=100)
        
        # Render the tree to the string buffer
        temp_console.print(tree)
        
        # Return the contents of the buffer
        return string_io.getvalue()
    
    def update_display(self):
        """Update the widget display based on expanded state."""
        msg_type = self.message.get("type", "unknown")
        timestamp = self.message.get("timestamp", datetime.now().isoformat())
        connection_id = self.message.get("connection_id", "unknown")[:5]
        user_id = self.message.get("user_id", "unknown")[:5]
        
        timestamp_display = timestamp.split('T')[1].split('.')[0] if 'T' in timestamp else timestamp
        title = f"{msg_type} at {timestamp_display} [connection: {connection_id}, user: {user_id}]"
        
        content = ""
        border_style = "dim"
        title_style = "white"
        box_type = box.SIMPLE
        
        if msg_type == "user_joined":
            title_style = "bold green"
            border_style = "green"
            box_type = box.ROUNDED
            content = f"User {user_id} joined the pad"
            
        elif msg_type == "user_left":
            title_style = "bold red"
            border_style = "red"
            box_type = box.ROUNDED
            content = f"User {user_id} left the pad"
            
        elif msg_type == "pad_update":
            title_style = "bold blue"
            border_style = "blue"
            box_type = box.ROUNDED
            
            # Check for data field containing Excalidraw content
            has_excalidraw_data = (
                "data" in self.message and 
                isinstance(self.message["data"], dict) and
                ("elements" in self.message["data"] or "appState" in self.message["data"] or "files" in self.message["data"])
            )
            
            if has_excalidraw_data:
                button_text = "[▼] Show Excalidraw data" if not self.expanded else "[▲] Hide Excalidraw data"
                content = f"User {user_id} updated the pad\n\n{button_text}"
                
                if self.expanded:
                    content = f"User {user_id} updated the pad\n\n{button_text}\n\n"
                    data = self.message["data"]
                    
                    # Create a tree to display the structure
                    excalidraw_tree = Tree("Excalidraw Data")
                    
                    # Elements (drawing objects)
                    if "elements" in data:
                        element_count = len(data["elements"])
                        elements_branch = excalidraw_tree.add(f"[bold cyan]Elements[/] ({element_count})")
                        
                        # Show a preview of a few elements
                        max_elements = 3
                        for i, element in enumerate(data["elements"][:max_elements]):
                            element_type = element.get("type", "unknown")
                            element_id = element.get("id", "unknown")[:8]
                            elements_branch.add(f"[cyan]{element_type}[/] (id: {element_id})")
                        
                        if element_count > max_elements:
                            elements_branch.add(f"... and {element_count - max_elements} more elements")
                    
                    # AppState (view state, settings)
                    if "appState" in data:
                        app_state = data["appState"]
                        app_state_branch = excalidraw_tree.add("[bold green]AppState[/]")
                        
                        # Show important appState properties
                        important_props = ["viewBackgroundColor", "gridSize", "zoom", "scrollX", "scrollY"]
                        for prop in important_props:
                            if prop in app_state:
                                app_state_branch.add(f"[green]{prop}[/]: {app_state[prop]}")
                        
                        # Show count of other properties
                        other_props_count = len(app_state) - len([p for p in important_props if p in app_state])
                        if other_props_count > 0:
                            app_state_branch.add(f"... and {other_props_count} more properties")
                    
                    # Files (attached files/images)
                    if "files" in data:
                        files = data["files"]
                        files_count = len(files)
                        if files_count > 0:
                            files_branch = excalidraw_tree.add(f"[bold yellow]Files[/] ({files_count})")
                            for file_id, file_data in list(files.items())[:3]:
                                files_branch.add(f"[yellow]{file_id[:8]}...[/]")
                            
                            if files_count > 3:
                                files_branch.add(f"... and {files_count - 3} more files")
                        else:
                            excalidraw_tree.add("[bold yellow]Files[/] (none)")
                    
                    # Properly render the tree to a string
                    content += self.render_rich_tree(excalidraw_tree)
                    
                    self.update(Panel(
                        content,
                        title=Text(title, style=title_style),
                        border_style=border_style,
                        box=box_type
                    ))
                    return
            else:
                content = f"Content updated by user {user_id} (no Excalidraw data found in message)"
                if "data" in self.message:
                    # Try to display raw data if available
                    if isinstance(self.message["data"], str) and len(self.message["data"]) > 0:
                        content += "\n\nData appears to be a string, not parsed JSON"
                        if self.expanded:
                            # Show preview of the raw data string
                            preview = self.message["data"][:200] + "..." if len(self.message["data"]) > 200 else self.message["data"]
                            content += f"\n\n{preview}"
                
        elif msg_type == "connected":
            title_style = "bold cyan"
            content = f"Successfully connected with connection ID: {connection_id}"
            
        elif msg_type == "welcome":
            title_style = "bold magenta"
            border_style = "magenta"
            box_type = box.DOUBLE
            content = self.message.get("message", "Welcome to pad listener!")
            
        else:
            title_style = "bold yellow"
            if self.expanded:
                content = json.dumps(self.message, indent=2)
            else:
                content = f"Unknown event type: {msg_type} [▼] Show details"
        
        self.update(Panel(
            content,
            title=Text(title, style=title_style),
            border_style=border_style,
            box=box_type
        ))
    
    def on_click(self):
        """Toggle expanded state when clicked."""
        if self.message.get("type") in ["pad_update", "unknown"]:
            self.expanded = not self.expanded
            self.update_display()

class PadEventApp(App):
    """Main application for monitoring pad events."""
    CSS = """
    #events-container {
        width: 100%;
        height: 100%;
        overflow-y: auto;
    }
    
    PadUpdateWidget {
        margin: 0 0 1 0;
    }
    
    #status-bar {
        dock: bottom;
        height: 1;
        background: $surface;
        color: $text;
    }
    """
    
    BINDINGS = [
        ("q", "quit", "Quit"),
        ("c", "clear", "Clear Events"),
    ]
    
    pad_id = reactive("")
    connection_status = reactive("Disconnected")
    event_count = reactive(0)
    
    def __init__(self, pad_id):
        super().__init__()
        self.pad_id = str(pad_id)
        self.redis_client = None
    
    def compose(self) -> ComposeResult:
        """Create UI components."""
        yield Header(show_clock=True)
        yield ScrollableContainer(id="events-container")
        yield Static(f"Monitoring pad: {self.pad_id} | Status: {self.connection_status} | Events: {self.event_count}", id="status-bar")
        yield Footer()
    
    def on_mount(self) -> None:
        """Set up the application when it starts."""
        self.update_status("Connecting...")
        # Starting the worker method directly - Textual handles the task creation
        self.start_redis_listener()
    
    def update_status(self, status: str) -> None:
        """Update the connection status and status bar."""
        self.connection_status = status
        status_bar = self.query_one("#status-bar")
        status_bar.update(f"Monitoring pad: {self.pad_id} | Status: {self.connection_status} | Events: {self.event_count}")
    
    @work(thread=False)
    async def start_redis_listener(self):
        """Connect to Redis and start listening for events.
        This uses Textual's work decorator to run as a background task.
        """
        try:
            # Connect to Redis
            self.redis_client = await get_redis_client()
            stream_key = f"pad:stream:{self.pad_id}"
            
            self.update_status("Connected")
            
            # Add a welcome message
            welcome_message = {
                "type": "welcome",
                "timestamp": datetime.now().isoformat(),
                "connection_id": "system",
                "user_id": "system",
                "message": f"Connected to pad stream: {self.pad_id}"
            }
            self.add_message(welcome_message)
            
            # Listen for events
            last_id = "$"  # Start from latest messages
            
            while True:
                try:
                    # Read messages from the Redis stream
                    streams = await self.redis_client.xread({stream_key: last_id}, count=5, block=1000)
                    
                    if streams:
                        stream_name, stream_messages = streams[0]
                        for message_id, message_data_raw in stream_messages:
                            # Convert raw Redis data to a formatted dictionary
                            formatted_message = {}
                            for k, v in message_data_raw.items():
                                key = k.decode() if isinstance(k, bytes) else k
                                
                                # Try to parse JSON values
                                if isinstance(v, bytes):
                                    string_value = v.decode()
                                else:
                                    string_value = str(v)
                                
                                formatted_message[key] = string_value
                            
                            # Add the message to the UI
                            self.add_message(formatted_message)
                            last_id = message_id
                    
                    # Prevent CPU hogging
                    await asyncio.sleep(0.1)
                    
                except Exception as e:
                    self.update_status(f"Error: {str(e)}")
                    await asyncio.sleep(1)
                    
        except Exception as e:
            self.update_status(f"Connection failed: {str(e)}")
    
    def add_message(self, message):
        """Add a new message to the UI."""
        container = self.query_one("#events-container")
        update_widget = PadUpdateWidget(message)
        container.mount(update_widget)
        
        # Scroll to the new message
        container.scroll_end(animate=False)
        
        # Update event count
        self.event_count += 1
        status_bar = self.query_one("#status-bar")
        status_bar.update(f"Monitoring pad: {self.pad_id} | Status: {self.connection_status} | Events: {self.event_count}")
    
    async def action_clear(self) -> None:
        """Clear all events from the container."""
        container = self.query_one("#events-container")
        container.remove_children()
        self.event_count = 0
        status_bar = self.query_one("#status-bar")
        status_bar.update(f"Monitoring pad: {self.pad_id} | Status: {self.connection_status} | Events: {self.event_count}")
    
    async def action_quit(self) -> None:
        """Quit the application cleanly."""
        if self.redis_client:
            try:
                await self.redis_client.close()
            except:
                # Handle deprecated close() method
                try:
                    await self.redis_client.aclose()
                except:
                    pass
        
        # Wait a moment to ensure clean shutdown
        await asyncio.sleep(0.1)
        self.exit()

# Reuse the helper functions from the previous script
async def get_redis_client():
    """Get Redis client using configuration from .env file."""
    redis_password = os.getenv("REDIS_PASSWORD", "pad")
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", 6379))
    
    redis_url = f"redis://:{redis_password}@{redis_host}:{redis_port}/0"
    setup_console.print(f"[dim]Connecting to Redis at {redis_host}:{redis_port}[/dim]")
    
    try:
        redis_client = await aioredis.from_url(redis_url)
        # Test connection
        await redis_client.ping()
        setup_console.print("[green]Redis connection established[/green]")
        return redis_client
    except Exception as e:
        setup_console.print(f"[red]Failed to connect to Redis:[/red] {str(e)}")
        raise

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

def main():
    """Main entry point for the pad events listener script."""
    parser = argparse.ArgumentParser(description="Interactive viewer for pad events from Redis")
    parser.add_argument("pad_id", help="UUID of the pad to listen to")
    parser.add_argument("--from-start", "-f", action="store_true", 
                      help="Read from the beginning of the stream history")
    
    args = parser.parse_args()
    
    # Validate the pad_id is a valid UUID
    try:
        pad_uuid = UUID(args.pad_id)
    except ValueError:
        setup_console.print("[red]Invalid pad ID. Must be a valid UUID.[/red]")
        return
    
    setup_console.print(f"[bold]Interactive Pad Event Listener[/bold] - Connecting to pad: {pad_uuid}")
    
    # Start the Textual app
    app = PadEventApp(pad_uuid)
    app.run()

if __name__ == "__main__":
    main() 