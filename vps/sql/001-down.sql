-- Destructive: restore a verified backup instead when it contains live data.
DROP TABLE alarms;
DROP TABLE kv;
PRAGMA user_version = 0;
