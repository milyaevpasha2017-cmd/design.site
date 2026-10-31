"""Telegram HTTPS over IPv4; hostname and certificate verification stay enabled."""
import http.client
import socket
import urllib.request


def ipv4_connection(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
    host, port = address
    last_error = None
    for family, kind, protocol, _, target in socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM):
        connection = socket.socket(family, kind, protocol)
        try:
            if timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:
                connection.settimeout(timeout)
            if source_address:
                connection.bind(source_address)
            connection.connect(target)
            return connection
        except OSError as error:
            last_error = error
            connection.close()
    if last_error:
        raise last_error
    raise OSError('No IPv4 address available')


class IPv4HTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = ipv4_connection


class IPv4HTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, request):
        return self.do_open(IPv4HTTPSConnection, request, context=self._context)


def open_telegram(request, timeout=15):
    # No proxy environment lookup; connect directly with the original TLS hostname.
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), IPv4HTTPSHandler()).open(request, timeout=timeout)
