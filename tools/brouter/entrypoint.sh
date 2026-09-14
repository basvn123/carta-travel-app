#!/bin/sh
# The house profiles are mounted read-only at /profiles and copied next to
# the stock ones, because a BRouter profile directory is one directory: it
# has to hold lookups.dat, and the server is given exactly one path for it.
# The stock profiles stay available too; trekking is the one that knows
# about ferries, which the gap bridge falls back to.
set -e
mkdir -p /customprofiles
for f in /profiles/*.brf; do
  [ -f "$f" ] && cp -f "$f" /opt/brouter/profiles2/
done
exec java ${JAVA_OPTS:--Xmx1g -Xms256m} -cp /opt/brouter/brouter.jar \
  btools.server.RouteServer /segments /opt/brouter/profiles2 /customprofiles 17777 4
