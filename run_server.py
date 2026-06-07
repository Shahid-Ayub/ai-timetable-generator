import http.server
import socketserver
import webbrowser
import sys

PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler

# Allow port customization via command line
if len(sys.argv) > 1:
    try:
        PORT = int(sys.argv[1])
    except ValueError:
        pass

print(f"==================================================")
print(f" SchedulerAI Local Development Server")
print(f"==================================================")
print(f"Serving files from the workspace directory...")
print(f"URL: http://localhost:{PORT}")
print(f"Press CTRL+C in this terminal to stop the server.")
print(f"==================================================")

try:
    # Automatically open default web browser
    webbrowser.open(f"http://localhost:{PORT}")
    
    # Run server
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped. Goodbye!")
    sys.exit(0)
except Exception as e:
    print(f"Error starting server: {e}")
    sys.exit(1)
