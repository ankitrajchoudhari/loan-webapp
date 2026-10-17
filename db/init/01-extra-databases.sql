-- Practice (test) data lives in its own database so it can never mix with real records.
CREATE DATABASE samiti_test OWNER samiti;
-- Used only by `npm test` (wiped on every run).
CREATE DATABASE samiti_ci OWNER samiti;
CREATE DATABASE samiti_ci_practice OWNER samiti;
