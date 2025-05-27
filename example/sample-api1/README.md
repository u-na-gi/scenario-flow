# Deno Auth API Server

A simple authentication API server built with Deno and Oak.

## Features

- Token-based authentication
- Protected API endpoints
- Simple in-memory token storage

## API Endpoints

### Authentication

- `POST /login` - Returns an authentication token

### Protected Endpoints (Require Authentication)

- `GET /api/user` - Returns user information
- `GET /api/data` - Returns sample data
- `GET /api/status` - Returns server status

## Running the Server

```bash
# Navigate to the auth-api directory
cd auth-api

# Start the server
deno task dev
```

The server will start on http://localhost:8000

## Authentication

To authenticate, make a POST request to the `/login` endpoint:

```bash
curl -X POST http://localhost:8000/login
```

This will return a token in the following format:

```json
{
  "success": true,
  "token": "your-token-here"
}
```

## Using the Token

To access protected endpoints, include the token in the Authorization header:

```bash
curl -H "Authorization: Bearer your-token-here" http://localhost:8000/api/user
```

## Error Handling

If you try to access a protected endpoint without a valid token, you'll receive
a 401 Unauthorized error:

```json
{
  "success": false,
  "message": "Authentication token is missing or invalid"
}
```
