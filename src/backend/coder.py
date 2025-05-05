import requests
from config import CODER_API_KEY, CODER_URL, CODER_TEMPLATE_ID, CODER_DEFAULT_ORGANIZATION, CODER_WORKSPACE_NAME

class CoderAPI:
    """
    A class for interacting with the Coder API using credentials from config
    """
    
    def __init__(self):
        # Get configuration from config
        self.api_key = CODER_API_KEY
        self.coder_url = CODER_URL
        self.template_id = CODER_TEMPLATE_ID
        self.default_organization_id = CODER_DEFAULT_ORGANIZATION
        
        # Check if required configuration variables are set
        if not self.api_key or not self.coder_url:
            raise ValueError("CODER_API_KEY and CODER_URL must be set in environment variables")
            
        # Set up common headers for API requests
        self.headers = {
            'Accept': 'application/json',
            'Coder-Session-Token': self.api_key
        }
    
    def _get_all_templates(self): 
        """
        Get all templates from the Coder API
        """
        endpoint = f"{self.coder_url}/api/v2/templates"
        response = requests.get(endpoint, headers=self.headers)
        response.raise_for_status()
        return response.json()
    

    def get_users(self):
        """
        Get all users from the Coder API
        """
        endpoint = f"{self.coder_url}/api/v2/users"
        response = requests.get(endpoint, headers=self.headers)
        response.raise_for_status()  # Raise exception for 4XX/5XX responses
        return response.json()['users']

    def get_user_by_email(self, email):
        """
        Get a user by email
        
        Args:
            email (str): email to search for
            
        Returns:
            dict: User data if found, None otherwise
        """
        users = self.get_users()
        for user in users:
            if user['email'] == email:
                return user
        return None
    
    def create_user(self, username, email, name):
        """
        Create a new user in Coder
        
        Args:
            username (str): Username for the new user
            email (str): Email for the new user
            name (str, optional): Full name for the new user
            login_type (str, optional): Login type, defaults to "oidc"
            organization_ids (list, optional): List of organization IDs to add the user to.
                If not provided, use default organization from .env
            
        Returns:
            dict: Created user data
        """
        login_type="oidc"
        endpoint = f"{self.coder_url}/api/v2/users"
        organization_ids = [self.default_organization_id]
        
        data = {
            "username": username,
            "email": email,
            "login_type": login_type,
            "organization_ids": organization_ids
        }
        
        if name:
            data["name"] = name
            
        # Set headers for JSON content
        headers = self.headers.copy()
        headers['Content-Type'] = 'application/json'
        
        response = requests.post(endpoint, headers=headers, json=data)
        response.raise_for_status()
        return response.json()
    
    def ensure_user_exists(self, user_info):
        """
        Ensure a user exists in Coder, creating them if they don't
        
        Args:
            user_info (dict): User information containing email and name
            
        Returns:
            dict: User data
            bool: Whether the user was newly created
        """
        
        email = user_info.get('email', '')
        name = user_info.get('name', '')

        # First check if user exists by email
        existing_user = self.get_user_by_email(email)
        if existing_user:
            return existing_user, False
            
        # Generate base username from email (everything before @, lowercase, alphanumeric only)
        base_username = ''.join(c for c in email.split('@')[0].lower() if c.isalnum())
        
        # If base username is empty, use a default
        if not base_username:
            base_username = 'user'
            
        # Ensure username is unique
        username = base_username
        for i in range(10):
            # Check if username exists
            users = self.get_users()
            username_exists = any(user['username'] == username for user in users)
            if not username_exists:
                break
            # If username exists, append a number
            username = f"{base_username}{i}"
        else:
            raise Exception("Failed to create unique username")
            
        new_user = self.create_user(username, email, name)
        return new_user, True
    

    def get_workspace_metadata(self, workspace_id):
        """
        Get the metadata of a workspace
        """
        endpoint = f"{self.coder_url}/api/v2/workspaces/{workspace_id}"
        response = requests.get(endpoint, headers=self.headers)
        return response.json()
    
    def get_workspace_status_for_user(self, username):
        """
        Get the status of a user's workspace
        
        Args:
            username (str): Username to get workspace status for
            
        Returns:
            dict: Workspace status data if found, None otherwise
        """
        workspace_name = CODER_WORKSPACE_NAME
        
        endpoint = f"{self.coder_url}/api/v2/users/{username}/workspace/{workspace_name}"
        response = requests.get(endpoint, headers=self.headers)
        
        # If workspace not found, return None
        if response.status_code == 404:
            return None
            
        response.raise_for_status()
        return response.json()
    
    def ensure_workspace_exists(self, username):
        """
        Ensure a workspace exists for a user
        """
        workspace = self.get_workspace_status_for_user(username)
        if not workspace:
            self.create_workspace(username)

    def start_workspace(self, workspace_id):
        """
        Start a workspace by creating a build with start transition
        
        Args:
            workspace_id (str): The ID of the workspace to start
            
        Returns:
            dict: Response from the API
        """

        # First check if the workspace is dormant
        if self.is_workspace_dormant(workspace_id):
            print("Workspace was dormant, setting to not dormant")
            self.set_workspace_dormancy(workspace_id, False)

        # First get the workspace to get its template version
        workspace_endpoint = f"{self.coder_url}/api/v2/workspaces/{workspace_id}"
        workspace_response = requests.get(workspace_endpoint, headers=self.headers)
        workspace_response.raise_for_status()
        workspace = workspace_response.json()
        
        endpoint = f"{self.coder_url}/api/v2/workspaces/{workspace_id}/builds"
        data = {
            "dry_run": False,
            "orphan": False,
            "rich_parameter_values": [],
            "state": [],
            "template_version_id": workspace["template_active_version_id"],
            "transition": "start"
        }
        headers = self.headers.copy()
        headers['Content-Type'] = 'application/json'
        response = requests.post(endpoint, headers=headers, json=data)
        response.raise_for_status()
        return response.json()

    def stop_workspace(self, workspace_id):
        """
        Stop a workspace by creating a build with stop transition
        
        Args:
            workspace_id (str): The ID of the workspace to stop
            
        Returns:
            dict: Response from the API
        """
        # First get the workspace to get its template version
        workspace_endpoint = f"{self.coder_url}/api/v2/workspaces/{workspace_id}"
        workspace_response = requests.get(workspace_endpoint, headers=self.headers)
        workspace_response.raise_for_status()
        workspace = workspace_response.json()

        
        endpoint = f"{self.coder_url}/api/v2/workspaces/{workspace_id}/builds"
        data = {
            "dry_run": False,
            "orphan": False,
            "rich_parameter_values": [],
            "state": [],
            "template_version_id": workspace["template_active_version_id"],
            "transition": "stop"
        }
        headers = self.headers.copy()
        headers['Content-Type'] = 'application/json'
        response = requests.post(endpoint, headers=headers, json=data)
        response.raise_for_status()
        return response.json()
    
    def create_workspace(self, user_id, parameter_values=None):
        """
        Create a new workspace for a user using a template
        
        Args:
            user_id (str, optional): User ID to create the workspace for. Defaults to USER_ID from .env.
            name (str, optional): Name for the new workspace. Defaults to a generated name.
            template_id (str, optional): Template ID to use. Defaults to TEMPLATE_ID from .env.
            parameter_values (list, optional): List of template parameter values. Example:
                [{"name": "param_name", "value": "param_value"}]
        
        Returns:
            dict: Created workspace data
        """
            
        template_id = self.template_id
            
        if not template_id:
            raise ValueError("template_id must be provided or TEMPLATE_ID must be set in environment variables")
            
        name = CODER_WORKSPACE_NAME
            
        # Prepare the request data
        data = {
            "name": name,
            "template_id": template_id
        }
        
        # Add rich_parameter_values if provided
        if parameter_values:
            data["rich_parameter_values"] = parameter_values
            
        # Set headers for JSON content
        headers = self.headers.copy()
        headers['Content-Type'] = 'application/json'
        
        # Create the workspace
        print("Creating workspace for user", user_id)
        endpoint = f"{self.coder_url}/api/v2/users/{user_id}/workspaces"
        response = requests.post(endpoint, headers=headers, json=data)

        response.raise_for_status()
        return response.json()
    
    def is_workspace_dormant(self, workspace_id) -> bool:
        """
        Check if a workspace is dormant
        """
        state = self.get_workspace_metadata(workspace_id)
        if state["dormant_at"]:
            return True
        return False

    def set_workspace_dormancy(self, workspace_id, dormant: bool):
        """
        Set a workspace to be dormant or not
        """
        endpoint = f"{self.coder_url}/api/v2/workspaces/{workspace_id}/dormant"

        data = {"dormant": dormant}
        headers = self.headers.copy()
        headers['Content-Type'] = 'application/json'
        response = requests.put(endpoint, headers=headers, json=data)
        response.raise_for_status()
        return response.json()
