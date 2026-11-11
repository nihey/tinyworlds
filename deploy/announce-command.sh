#!/bin/sh
# The forced command of the ssh key that announces built cities (ANNOUNCE_HOST in deploy.sh):
# runs the API's announce command in its container, for the world ids the client asked for, and
# nothing else. Installed on the server, owned by root, and named in the key's line of the
# authorized_keys of a user that may run docker (deploy/README.md):
#
#   command="/usr/local/bin/tinyworlds-announce <api container or service>",restrict ssh-ed25519 …
#
# The client's command (SSH_ORIGINAL_COMMAND) is only read as a list of world ids.
set -eu
# no globbing: the words below are split, never expanded
set -f

service="${1:?usage: tinyworlds-announce <api container or service> (as a forced command)}"
case "$service" in
  [A-Za-z0-9]*) ;;
  *) echo "not a container or service name: $service" >&2 && exit 2 ;;
esac
case "$service" in
  *[!A-Za-z0-9_.-]*) echo "not a container or service name: $service" >&2 && exit 2 ;;
esac

worlds=""
for word in ${SSH_ORIGINAL_COMMAND:-}; do
  case "$word" in
    *[!a-z0-9]*) echo "not a world id: $word" >&2 && exit 2 ;;
  esac
  if [ "${#word}" -lt 3 ] || [ "${#word}" -gt 20 ]; then
    echo "not a world id: $word" >&2
    exit 2
  fi
  worlds="$worlds $word"
done
if [ -z "$worlds" ]; then
  echo "no world to announce" >&2
  exit 2
fi

# the container itself, or the one running the Swarm service of that name (<service>.1.<task>)
container="$(docker ps --format '{{.Names}}' | awk -v s="$service" '$0 == s || index($0, s ".") == 1' | head -n 1)"
if [ -z "$container" ]; then
  echo "No running container is named $service, nor runs a service of that name." >&2
  exit 3
fi
# shellcheck disable=SC2086 # the ids were checked above: lowercase letters and digits only
exec docker exec "$container" node dist/benefactors/announce-cli.js $worlds
