# 🚀 pad.ws: Your Whiteboard IDE 🚀

Welcome to `pad.ws`, the innovative whiteboard environment integrated right into your IDE!

## 🛠️ Self-Hosting Guide 🛠️

Ready to host your own `pad.ws` instance? Follow these steps:

### ✅ Prerequisites

*   **Docker & Docker Compose:** Ensure you have both installed and running. [Install Docker](https://docs.docker.com/get-docker/) / [Install Docker Compose](https://docs.docker.com/compose/install/)

### 1️⃣ Step 1: Start PostgreSQL 🐘

*   Run the PostgreSQL container using the provided configuration (e.g., in your `docker-compose.yml`).

```bash
# Example command (adjust based on your setup)
docker compose up -d postgres 
```

### 2️⃣ Step 2: Configure Keycloak 🔑

*   Run the Keycloak container.
*   Access the Keycloak admin console.
*   **Create a Realm:** Name it appropriately (e.g., `pad-ws`).
*   **Create a Client:**
    *   Give it a `Client ID` (e.g., `pad-ws-client`).
    *   Enable **Client Authentication**.
    *   Leave other settings as default for now.
*   **Get Credentials:**
    *   Navigate to `Clients` -> `[Your Client ID]` -> `Credentials` tab.
    *   Note the **Client secret**.
    *   Update your environment variables file (`.env`) with:
        ```dotenv
        OIDC_CLIENT_ID=your_client_id 
        OIDC_CLIENT_SECRET=your_client_secret 
        ```
*   **Create a User:**
    *   Navigate to `Users` -> `Create user`.
    *   Fill in the details.
    *   **Important:** Tick `Email verified`.
    *   Go to the `Credentials` tab for the new user and set a password.

### 3️⃣ Step 3: Set Up Coder 🧑‍💻

*   **Find Docker Group ID:** You'll need this to grant necessary permissions.
    ```bash
    getent group docker | cut -d: -f3 
    ```
*   Update your `.env` file with the `DOCKER_GROUP_ID`:
    ```dotenv
    DOCKER_GROUP_ID=your_docker_group_id 
    ```
*   Run the Coder container.
*   **Access Coder UI:** Open `http://localhost:7080` in your browser.
*   **First Login:** Create an administrator user (e.g., `admin`).
*   **Create a Template:**
    *   Use the "Start from template" option.
    *   Choose a base image (e.g., `docker-containers` or a simple Ubuntu). Configure it as needed.
*   **Generate API Key:**
    *   Click your profile picture (top right) -> `Account` -> `API Keys`.
    *   Generate a new token.
    *   Update your `.env`:
        ```dotenv
        CODER_API_KEY=your_coder_api_key 
        ```
*   **Get Template ID:**
    *   Visit `http://localhost:7080/api/v2/templates` in your browser (or use `curl`).
    *   Find the `id` of the template you created.
    *   Update your `.env`:
        ```dotenv
        CODER_TEMPLATE_ID=your_coder_template_id # Example: 85fb21ba-085b-47a6-9f4d-94ea979aaba9
        ```
*   **Get Default Organization ID:**
    *   Visit `http://localhost:7080/api/v2/organizations` in your browser (or use `curl`).
    *   Find the `id` of your organization (usually the default one).
    *   Update your `.env`:
        ```dotenv
        CODER_DEFAULT_ORGANIZATION=your_organization_id # Example: 70f6af06-ef3a-4b4c-a663-c03c9ee423bb
        ```

### 4️⃣ Step 4: Build & Run the Pad App 📝

*   **Build the Docker Image:**
    ```bash
    docker build -t pad . 
    ```
*   **Run the Application:**
    *   Ensure all environment variables in your `.env` file are correctly set.
    *   Run the `pad` application container (e.g., using `docker compose up pad`).

```bash
# Example command (adjust based on your setup)
docker compose up -d pad 
```

🎉 **Congratulations!** You should now have your self-hosted `pad.ws` instance up and running! 🎉




