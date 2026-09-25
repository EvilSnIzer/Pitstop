from django.conf import settings


class PrivateNetworkHostMiddleware:
    """Accept Render private-network Host headers without widening ALLOWED_HOSTS.

    Render gives each service a single-label internal hostname
    (``<service-name>-<hash>``, e.g. ``pitstop-api-ab12``) that only resolves
    inside the same workspace/region private network. When the Next.js BFF
    proxies to this API over that network, Django sees a Host header that is
    not — and cannot be, the hash is dynamic — in ``ALLOWED_HOSTS``.

    A hostname without a dot cannot be a public FQDN and cannot be typed into
    or resolved by a browser, so when ``TRUST_PRIVATE_NETWORK_HOST`` is on we
    rewrite it to this service's public hostname (``CANONICAL_HOST`` from
    ``RENDER_EXTERNAL_HOSTNAME``). Strict host validation for all public
    traffic is unchanged.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.TRUST_PRIVATE_NETWORK_HOST and settings.CANONICAL_HOST:
            host = request.META.get("HTTP_HOST", "")
            # Strip an optional port; skip bracketed IPv6 literals entirely.
            name = host.partition(":")[0].strip().lower()
            if name and not name.startswith("[") and "." not in name:
                request.META["HTTP_HOST"] = settings.CANONICAL_HOST
        return self.get_response(request)
