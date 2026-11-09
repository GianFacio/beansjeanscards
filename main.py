"""Serve the card-store pages and scripts from a local web server."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import webbrowser

CONTENT_TYPES = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
}


class StorefrontHandler(BaseHTTPRequestHandler):
	"""Map browser requests to the local pages and assets."""

	def do_GET(self):
		request_path = urlsplit(self.path).path
		root = Path(__file__).parent.resolve()
		if request_path == "/":
			request_path = "/index.html"
		relative = Path(unquote(request_path).lstrip("/"))
		file_path = (root / relative).resolve()
		# Only root pages and the css/ and js/ folders are served.
		allowed = (
			(file_path.parent == root and file_path.suffix == ".html")
			or (file_path.is_relative_to(root / "css") and file_path.suffix == ".css")
			or (file_path.is_relative_to(root / "js") and file_path.suffix == ".js")
		)
		content_type = CONTENT_TYPES.get(file_path.suffix)
		if not allowed or content_type is None:
			self.send_error(404)
			return
		try:
			# Resolve files from this script's folder, independent of the terminal location.
			content = file_path.read_bytes()
		except OSError:
			self.send_error(404)
			return
		self.send_response(200)
		self.send_header("Content-Type", content_type)
		self.send_header("Content-Length", str(len(content)))
		self.send_header("Cache-Control", "no-store")
		self.end_headers()
		self.wfile.write(content)


if __name__ == "__main__":
	# Local address opened when the server starts.
	url = "http://localhost:8000"
	server = ThreadingHTTPServer(("127.0.0.1", 8000), StorefrontHandler)
	print(f"Storefront running at {url}")
	if not webbrowser.open(url):
		print(f"Open this URL in your browser: {url}")
	try:
		server.serve_forever()
	except KeyboardInterrupt:
		print("\nServer stopped.")
	finally:
		server.server_close()
