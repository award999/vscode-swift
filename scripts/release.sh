#!/bin/bash
##===----------------------------------------------------------------------===##
##
## This source file is part of the VS Code Swift open source project
##
## Copyright (c) 2025 the VS Code Swift project authors
## Licensed under Apache License v2.0
##
## See LICENSE.txt for license information
## See CONTRIBUTORS.txt for the list of VS Code Swift project authors
##
## SPDX-License-Identifier: Apache-2.0
##
##===----------------------------------------------------------------------===##

if [ -z "$VSCODE_SWIFT_VSIX_ID" ]; then
    echo "Missing VSCODE_SWIFT_VSIX_ID"
    exit 1
fi
if [ -z "$VSCODE_SWIFT_PUBLISHER_TOKEN" ]; then
    echo "Missing VSCODE_SWIFT_PUBLISHER_TOKEN"
    exit 1
fi
export VSCODE_SWIFT_VSIX="vscode-swift.vsix"
export VSCODE_SWIFT_PRERELEASE_VSIX="vscode-swift-prerelease.vsix"
export GITHUB_REPOSITORY="swiftlang/vscode-swift"
export CI=1

# shellcheck disable=SC1091
. "$PWD/.github/workflows/scripts/setup-linux.sh" # Also works for macOS

if [ ! -f vscode-swift-sha.txt ]; then
    echo "Commit SHA was not present in artifact bundle"
fi
VSCODE_SWIFT_RELEASE_SHA="$(cat vscode-swift-sha.txt)"
git checkout "$VSCODE_SWIFT_RELEASE_SHA" # When tagging below we want to be on release commit

# npm test
exit_code=$?

if [[ "$exit_code" != "0" ]]; then
    exit $exit_code
fi

echo "$VSCODE_SWIFT_PUBLISHER_TOKEN" | npx @vscode/vsce login swiftlang

args=("-i")

if [ -n "$VSCODE_SWIFT_PRERELEASE" ]; then 
    args+=("$VSCODE_SWIFT_PRERELEASE_VSIX" "--pre-release")
else
    args+=("$VSCODE_SWIFT_VSIX")
fi

echo npx @vscode/vsce publish "${args[@]}"
npx @vscode/vsce publish "${args[@]}"
# shellcheck disable=SC1091
. "$PWD/scripts/tag_release.sh"