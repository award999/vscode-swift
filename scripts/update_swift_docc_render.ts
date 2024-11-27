//===----------------------------------------------------------------------===//
//
// This source file is part of the VS Code Swift open source project
//
// Copyright (c) 2024 the VS Code Swift project authors
// Licensed under Apache License v2.0
//
// See LICENSE.txt for license information
// See CONTRIBUTORS.txt for the list of VS Code Swift project authors
//
// SPDX-License-Identifier: Apache-2.0
//
//===----------------------------------------------------------------------===//

import simpleGit from "simple-git";
import { spawn } from "child_process";
import { mkdtemp, mkdir, rm, readdir } from "fs/promises";
import * as path from "path";
import { tmpdir } from "os";
import * as semver from "semver";

function checkNodeVersion() {
    const nodeVersion = semver.parse(process.versions.node);
    if (nodeVersion === null) {
        throw new Error(
            "Unable to determine the version of NodeJS that this script is running under."
        );
    }
    if (!semver.satisfies(nodeVersion, "18")) {
        throw new Error(
            `Cannot build swift-docc-render with NodeJS v${nodeVersion.raw}. Please install and use NodeJS v18.`
        );
    }
}

async function cloneSwiftDocCRender(buildDirectory: string): Promise<string> {
    // Clone swift-docc-render
    const swiftDocCRenderDirectory = path.join(buildDirectory, "swift-docc-render");
    const git = simpleGit({ baseDir: buildDirectory });
    console.log("> git clone https://github.com/swiftlang/swift-docc-render.git");
    await git.clone("https://github.com/swiftlang/swift-docc-render.git", swiftDocCRenderDirectory);
    await git.cwd(swiftDocCRenderDirectory);
    // Apply our patches to swift-docc-render
    const patches = (
        await readdir(path.join(__dirname, "patches", "swift-docc-render"), {
            withFileTypes: true,
        })
    )
        .filter(entity => entity.isFile() && entity.name.endsWith(".patch"))
        .map(entity => path.join(entity.path, entity.name))
        .sort();
    console.log("> git apply \\\n" + patches.map(e => "    " + e).join(" \\\n"));
    await git.applyPatch(patches);
    return swiftDocCRenderDirectory;
}

async function exec(
    command: string,
    args: string[],
    options: { cwd?: string; env?: { [key: string]: string } } = {}
): Promise<void> {
    let logMessage = "> " + command;
    if (args.length > 0) {
        logMessage += " " + args.join(" ");
    }
    console.log(logMessage + "\n");
    return new Promise<void>((resolve, reject) => {
        const childProcess = spawn(command, args, { stdio: "inherit", ...options });
        childProcess.once("error", reject);
        childProcess.once("close", (code, signal) => {
            if (signal !== null) {
                reject(new Error(`Process exited due to signal '${signal}'`));
            } else if (code !== 0) {
                reject(new Error(`Process exited with code ${code}`));
            } else {
                resolve();
            }
            console.log("");
        });
    });
}

(async () => {
    checkNodeVersion();
    const outputDirectory = path.join(__dirname, "..", "assets", "swift-docc-render");
    await rm(outputDirectory, { force: true, recursive: true });
    await mkdir(outputDirectory, { recursive: true });
    const buildDirectory = await mkdtemp(path.join(tmpdir(), "update_swift_docc_render"));
    try {
        const swiftDocCRenderDirectory = await cloneSwiftDocCRender(buildDirectory);
        await exec("npm", ["install"], { cwd: swiftDocCRenderDirectory });
        await exec("npx", ["vue-cli-service", "build", "--dest", outputDirectory], {
            cwd: swiftDocCRenderDirectory,
            env: {
                ...process.env,
                VUE_APP_TARGET: "ide",
            },
        });
    } finally {
        await rm(buildDirectory, { force: true, recursive: true }).catch(error => {
            console.error(`Failed to remove temporary directory '${buildDirectory}'`);
            console.error(error);
        });
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});