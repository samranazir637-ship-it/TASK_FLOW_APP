from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class StorageBackend(ABC):
    @abstractmethod
    def put(self, key: str, data: bytes) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_path(self, key: str) -> Path:
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> None:
        raise NotImplementedError


class LocalStorage(StorageBackend):
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Invalid storage key")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get_path(self, key: str) -> Path:
        return self._path(key)

    def delete(self, key: str) -> None:
        path = self._path(key)
        path.unlink(missing_ok=True)


class S3CompatibleStorage(StorageBackend):
    def put(self, key: str, data: bytes) -> None:
        raise NotImplementedError("S3-compatible storage is not implemented")

    def get_path(self, key: str) -> Path:
        raise NotImplementedError("S3-compatible storage is not implemented")

    def delete(self, key: str) -> None:
        raise NotImplementedError("S3-compatible storage is not implemented")
