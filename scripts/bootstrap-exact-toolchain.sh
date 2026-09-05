#!/bin/sh
set -eu

PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
unset CDPATH ENV BASH_ENV NODE_OPTIONS NODE_PATH TAR_OPTIONS

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repository_root=$(CDPATH= cd -- "$script_directory/.." && pwd -P)
required_node_version=$(tr -d '[:space:]' < "$repository_root/.node-version")

case "$(uname -s)" in
  Darwin) node_platform=darwin ;;
  Linux) node_platform=linux ;;
  *)
    echo "EXACT TOOLCHAIN: unsupported operating system $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64) node_architecture=arm64 ;;
  x86_64|amd64) node_architecture=x64 ;;
  *)
    echo "EXACT TOOLCHAIN: unsupported architecture $(uname -m)" >&2
    exit 1
    ;;
esac

case "$node_platform-$node_architecture" in
  darwin-arm64)
    node_archive="node-v24.19.0-darwin-arm64.tar.gz"
    node_archive_sha256="8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d"
    ;;
  darwin-x64)
    node_archive="node-v24.19.0-darwin-x64.tar.gz"
    node_archive_sha256="d1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316"
    ;;
  linux-arm64)
    node_archive="node-v24.19.0-linux-arm64.tar.gz"
    node_archive_sha256="d28c8a5bf0a808f0ed434a1dce8c54ae98f0371c0bd86ac58abc613f73e6643f"
    ;;
  linux-x64)
    node_archive="node-v24.19.0-linux-x64.tar.gz"
    node_archive_sha256="f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4"
    ;;
esac

case "$node_archive" in
  "node-v${required_node_version}-${node_platform}-${node_architecture}.tar.gz") ;;
  *)
    echo "EXACT TOOLCHAIN: archive $node_archive does not match .node-version $required_node_version" >&2
    exit 1
    ;;
esac

stat_identity() {
  candidate=$1
  case "$node_platform" in
    darwin) stat -f '%u %Lp' "$candidate" ;;
    linux) stat -c '%u %a' -- "$candidate" ;;
  esac
}

current_uid=$(id -u)
temporary_root_input=${TMPDIR:-/tmp}
canonical_temp_root=$(CDPATH= cd -- "$temporary_root_input" && pwd -P)
canonical_home_root=$(CDPATH= cd -- ~ && pwd -P)
toolchain_cache_override=${IROHA_EXPLORER_TOOLCHAIN_CACHE:-}
if [ -n "$toolchain_cache_override" ]; then
  toolchain_cache=$toolchain_cache_override
else
  toolchain_cache="$canonical_temp_root/iroha-explorer-web-toolchain"
fi

case "$toolchain_cache" in
  /*) ;;
  *)
    echo "EXACT TOOLCHAIN: IROHA_EXPLORER_TOOLCHAIN_CACHE must be an absolute normalized path" >&2
    exit 1
    ;;
esac
case "$toolchain_cache" in
  */.|*/..|*/)
    echo "EXACT TOOLCHAIN: IROHA_EXPLORER_TOOLCHAIN_CACHE must be an absolute normalized path" >&2
    exit 1
    ;;
esac

cache_parent=$(dirname -- "$toolchain_cache")
cache_name=$(basename -- "$toolchain_cache")
if [ ! -d "$cache_parent" ] || [ -L "$cache_parent" ]; then
  echo "EXACT TOOLCHAIN: cache parent must be an existing real directory: $cache_parent" >&2
  exit 1
fi
canonical_cache_parent=$(CDPATH= cd -- "$cache_parent" && pwd -P)
if [ "$canonical_cache_parent" != "$cache_parent" ] || [ "$canonical_cache_parent/$cache_name" != "$toolchain_cache" ]; then
  echo "EXACT TOOLCHAIN: IROHA_EXPLORER_TOOLCHAIN_CACHE must be an absolute normalized path with a canonical parent" >&2
  exit 1
fi

path_below_root=${toolchain_cache#/}
case "$path_below_root" in
  */*) ;;
  *)
    echo "EXACT TOOLCHAIN: refusing root or an immediate child of root as the cache" >&2
    exit 1
    ;;
esac
case "$toolchain_cache" in
  /|"$canonical_temp_root"|"$canonical_home_root"|"$repository_root"|"$repository_root"/*)
    echo "EXACT TOOLCHAIN: refusing broad or in-repository exact-toolchain cache: $toolchain_cache" >&2
    exit 1
    ;;
esac

parent_identity=$(stat_identity "$cache_parent")
parent_uid=${parent_identity%% *}
parent_mode=${parent_identity#* }
parent_is_private=false
if [ "$parent_uid" -eq "$current_uid" ] && [ $((0$parent_mode & 0022)) -eq 0 ]; then
  parent_is_private=true
fi
parent_is_sticky_temp=false
if [ "$cache_parent" = "$canonical_temp_root" ] && [ $((0$parent_mode & 01000)) -ne 0 ]; then
  parent_is_sticky_temp=true
fi
if [ "$parent_is_private" != true ] && [ "$parent_is_sticky_temp" != true ]; then
  echo "EXACT TOOLCHAIN: cache parent must be owner-controlled or the sticky temp root: $cache_parent" >&2
  exit 1
fi

validate_private_directory() {
  directory=$1
  label=$2
  if [ ! -d "$directory" ] || [ -L "$directory" ]; then
    echo "EXACT TOOLCHAIN: $label must be a real directory: $directory" >&2
    exit 1
  fi
  canonical_directory=$(CDPATH= cd -- "$directory" && pwd -P)
  if [ "$canonical_directory" != "$directory" ]; then
    echo "EXACT TOOLCHAIN: $label must be canonical and must not traverse symbolic links: $directory" >&2
    exit 1
  fi
  directory_identity=$(stat_identity "$directory")
  directory_uid=${directory_identity%% *}
  directory_mode=${directory_identity#* }
  if [ "$directory_uid" -ne "$current_uid" ]; then
    echo "EXACT TOOLCHAIN: $label must be owned by the current account: $directory" >&2
    exit 1
  fi
  if [ $((0$directory_mode & 0777)) -ne 448 ]; then
    echo "EXACT TOOLCHAIN: $label must have mode 0700: $directory" >&2
    exit 1
  fi
}

if [ ! -e "$toolchain_cache" ]; then
  (umask 077 && mkdir -m 700 "$toolchain_cache") || {
    if [ ! -d "$toolchain_cache" ]; then
      echo "EXACT TOOLCHAIN: unable to create exact-toolchain cache: $toolchain_cache" >&2
      exit 1
    fi
  }
fi
validate_private_directory "$toolchain_cache" "exact-toolchain cache"

archives_root="$toolchain_cache/.archives"
if [ ! -e "$archives_root" ]; then
  (umask 077 && mkdir -m 700 "$archives_root") || {
    if [ ! -d "$archives_root" ]; then
      echo "EXACT TOOLCHAIN: unable to create archive cache: $archives_root" >&2
      exit 1
    fi
  }
fi
validate_private_directory "$archives_root" "archive cache"

archive_path="$archives_root/$node_archive"
downloaded_archive=
staging_root=

cleanup() {
  cleanup_status=$?
  trap - 0 1 2 15
  if [ -n "$downloaded_archive" ]; then
    case "$downloaded_archive" in
      "$archives_root"/.download.*) rm -f -- "$downloaded_archive" ;;
      *) echo "EXACT TOOLCHAIN: refusing to clean unexpected download path $downloaded_archive" >&2 ;;
    esac
  fi
  if [ -n "$staging_root" ]; then
    case "$staging_root" in
      "$toolchain_cache"/.node-run.*) rm -rf -- "$staging_root" ;;
      *) echo "EXACT TOOLCHAIN: refusing to clean unexpected staging path $staging_root" >&2 ;;
    esac
  fi
  exit "$cleanup_status"
}
trap cleanup 0 1 2 15

calculate_sha256() {
  hash_target=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$hash_target" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$hash_target" | awk '{print $1}'
  else
    echo "EXACT TOOLCHAIN: sha256sum or shasum is required" >&2
    return 1
  fi
}

validate_archive_file() {
  archive_file=$1
  if [ ! -f "$archive_file" ] || [ -L "$archive_file" ]; then
    echo "EXACT TOOLCHAIN: cached Node archive must be a real regular file: $archive_file" >&2
    exit 1
  fi
  archive_identity=$(stat_identity "$archive_file")
  archive_uid=${archive_identity%% *}
  archive_mode=${archive_identity#* }
  if [ "$archive_uid" -ne "$current_uid" ] || [ $((0$archive_mode & 0022)) -ne 0 ]; then
    echo "EXACT TOOLCHAIN: cached Node archive must be current-account-owned and not group/world-writable: $archive_file" >&2
    exit 1
  fi
  actual_sha256=$(calculate_sha256 "$archive_file")
  if [ "$actual_sha256" != "$node_archive_sha256" ]; then
    echo "EXACT TOOLCHAIN: $node_archive SHA-256 $actual_sha256 does not match $node_archive_sha256" >&2
    exit 1
  fi
}

if [ -L "$archive_path" ]; then
  echo "EXACT TOOLCHAIN: cached Node archive must not be a symbolic link: $archive_path" >&2
  exit 1
fi
if [ -e "$archive_path" ]; then
  validate_archive_file "$archive_path"
else
  downloaded_archive=$(mktemp "$archives_root/.download.XXXXXX")
  case "$downloaded_archive" in
    "$archives_root"/.download.*) ;;
    *)
      echo "EXACT TOOLCHAIN: mktemp returned an unexpected download path" >&2
      exit 1
      ;;
  esac
  chmod 600 "$downloaded_archive"
  curl --disable \
    --fail \
    --proto '=https' \
    --silent \
    --show-error \
    --tlsv1.2 \
    --output "$downloaded_archive" \
    "https://nodejs.org/dist/v${required_node_version}/${node_archive}"
  validate_archive_file "$downloaded_archive"
  if ln "$downloaded_archive" "$archive_path" 2>/dev/null; then
    rm -f -- "$downloaded_archive"
  elif [ -e "$archive_path" ] || [ -L "$archive_path" ]; then
    validate_archive_file "$archive_path"
    rm -f -- "$downloaded_archive"
  else
    echo "EXACT TOOLCHAIN: unable to publish the verified Node archive" >&2
    exit 1
  fi
  downloaded_archive=
fi

staging_root=$(mktemp -d "$toolchain_cache/.node-run.XXXXXX")
case "$staging_root" in
  "$toolchain_cache"/.node-run.*) ;;
  *)
    echo "EXACT TOOLCHAIN: mktemp returned an unexpected staging path" >&2
    exit 1
    ;;
esac
chmod 700 "$staging_root"
tar -xzf "$archive_path" -C "$staging_root"
node_archive_root=$(printf '%s\n' "$node_archive" | sed 's/\.tar\.gz$//')
exact_node="$staging_root/$node_archive_root/bin/node"
if [ ! -x "$exact_node" ] || [ -L "$exact_node" ]; then
  echo "EXACT TOOLCHAIN: verified archive did not contain the expected real Node executable" >&2
  exit 1
fi

if [ "$("$exact_node" --version)" != "v$required_node_version" ]; then
  echo "EXACT TOOLCHAIN: verified archive did not contain Node $required_node_version" >&2
  exit 1
fi
if [ "$#" -eq 0 ]; then
  echo "usage: sh scripts/bootstrap-exact-toolchain.sh <command> [arguments...]" >&2
  exit 1
fi

export IROHA_EXPLORER_TOOLCHAIN_CACHE="$toolchain_cache"
"$exact_node" "$repository_root/scripts/run-exact-toolchain.mjs" -- "$@"
