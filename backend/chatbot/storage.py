import io

from django.core.files.base import File
from django.core.files.storage import Storage


class DatabaseStorage(Storage):
    """Store uploaded media as rows in the default database.

    Selected with ``MEDIA_STORAGE=database`` — the storage backend used by the
    all-Render free-plan blueprint, where instances have an ephemeral disk,
    free services cannot attach persistent disks, and no external object
    storage account is desired. Upload validation caps files at 15 MiB, and
    media is only ever served through the owner-checked API view
    (``/api/v1/media/{id}/``), never through a public URL.

    The model is imported lazily: Django instantiates storage backends from
    ``STORAGES`` while the app registry is still loading.
    """

    def _model(self):
        from .models import StoredObject

        return StoredObject

    def _open(self, name, mode="rb"):
        if mode != "rb":
            raise ValueError("DatabaseStorage opens files read-only.")
        model = self._model()
        try:
            blob = model.objects.get(name=name)
        except model.DoesNotExist as exc:
            raise FileNotFoundError(name) from exc
        return File(io.BytesIO(bytes(blob.content)), name=name)

    def _save(self, name, content):
        data = content.read()
        self._model().objects.create(name=name, content=data, size=len(data))
        return name

    def delete(self, name):
        self._model().objects.filter(name=name).delete()

    def exists(self, name):
        return self._model().objects.filter(name=name).exists()

    def size(self, name):
        model = self._model()
        try:
            return model.objects.only("size").get(name=name).size
        except model.DoesNotExist as exc:
            raise FileNotFoundError(name) from exc

    def url(self, name):
        # Private media is streamed by the owner-checked API view; there is
        # deliberately no browsable/signed URL for database-stored files.
        raise NotImplementedError("DatabaseStorage does not expose file URLs.")
