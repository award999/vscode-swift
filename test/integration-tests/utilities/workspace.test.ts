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

import * as vscode from "vscode";
import { searchForPackages } from "../../../src/utilities/workspace";
import { expect } from "chai";

suite("Workspace Utilities Test Suite", () => {
    suite("searchForPackages", () => {
        test("ignores excluded file", async () => {
            const folders = await searchForPackages(
                (vscode.workspace.workspaceFolders ?? [])[0]!.uri,
                false,
                true
            );

            expect(folders.find(f => f.fsPath.includes("defaultPackage"))).to.not.be.undefined;
            expect(folders.find(f => f.fsPath.includes("excluded"))).to.be.undefined;
        });
    });
});
