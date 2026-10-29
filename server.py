import os
import sys
import http.server
import socketserver
import urllib.parse

class RangeRequestHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def log_message(self, format, *args):
        # Muestra logs limpios sin saturar la consola
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def do_GET(self):
        if self.path.startswith('/log?'):
            try:
                query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                print(">>> BROWSER LOG:\n" + query.get('data', [''])[0], flush=True)
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(b"OK")
            except Exception:
                pass
            return

        range_header = self.headers.get('Range')
        path = self.translate_path(self.path)

        if not range_header or not os.path.isfile(path):
            try:
                return super().do_GET()
            except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
                return

        try:
            file_size = os.path.getsize(path)
            range_str = range_header.replace('bytes=', '').strip()
            parts = range_str.split('-')
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
            end = min(end, file_size - 1)
            length = end - start + 1

            self.send_response(206, 'Partial Content')
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
            self.send_header('Content-Length', str(length))
            self.end_headers()

            with open(path, 'rb') as f:
                f.seek(start)
                bytes_to_send = length
                chunk_size = 64 * 1024
                while bytes_to_send > 0:
                    read_len = min(bytes_to_send, chunk_size)
                    data = f.read(read_len)
                    if not data:
                        break
                    self.wfile.write(data)
                    bytes_to_send -= len(data)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass
        except Exception as e:
            pass

class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

def run(port=8000):
    try:
        with ThreadedHTTPServer(('0.0.0.0', port), RangeRequestHandler) as httpd:
            print("=" * 60, flush=True)
            print(f"  MAREA - Servidor activo en http://localhost:{port}/", flush=True)
            print("  Soporte activo para Range/Streaming de video y audio.", flush=True)
            print("=" * 60, flush=True)
            httpd.serve_forever()
    except Exception as e:
        print(f"Error al iniciar servidor en puerto {port}: {e}", flush=True)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run(port)
