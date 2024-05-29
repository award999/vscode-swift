//===----------------------------------------------------------------------===//
//
// This source file is part of the VSCode Swift open source project
//
// Copyright (c) 2024 the VSCode Swift project authors
// Licensed under Apache License v2.0
//
// See LICENSE.txt for license information
// See CONTRIBUTORS.txt for the list of VSCode Swift project authors
//
// SPDX-License-Identifier: Apache-2.0
//
//===----------------------------------------------------------------------===//

import * as vscode from "vscode";
import * as assert from "assert";
import { beforeEach } from "mocha";
import { testAssetUri } from "../../fixtures";
import { globalWorkspaceContextPromise } from "../extension.test";
import { TestExplorer } from "../../../src/TestExplorer/TestExplorer";
import {
    assertTestControllerHierarchy,
    assertTestResults,
    eventPromise,
    getTestItem,
    syncPromise,
} from "./utilities";
import { WorkspaceContext } from "../../../src/WorkspaceContext";
import { RunProfileName, TestRunProxy } from "../../../src/TestExplorer/TestRunner";
import { Version } from "../../../src/utilities/version";

suite("Test Explorer Suite", function () {
    const MAX_TEST_RUN_TIME_MINUTES = 5;

    this.timeout(1000 * 60 * MAX_TEST_RUN_TIME_MINUTES);

    let workspaceContext: WorkspaceContext;
    let testExplorer: TestExplorer;

    async function waitForTestExplorerReady(): Promise<vscode.TestController> {
        return (
            await Promise.all([
                testExplorer.controller.items.size === 0
                    ? eventPromise(testExplorer.onTestItemsDidChange)
                    : Promise.resolve(testExplorer.controller),
                syncPromise(() => vscode.commands.executeCommand("workbench.view.testing.focus")),
            ])
        )[0];
    }

    async function runTest(
        controller: vscode.TestController,
        runProfile: RunProfileName,
        test: string
    ): Promise<TestRunProxy> {
        const testItem = getTestItem(controller, test);
        assert.ok(testItem);

        const targetProfile = testExplorer.testRunProfiles.find(
            profile => profile.label === runProfile
        );
        if (!targetProfile) {
            throw new Error(`Unable to find run profile named ${runProfile}`);
        }
        const request = new vscode.TestRunRequest([testItem]);

        return (
            await Promise.all([
                eventPromise(testExplorer.onCreateTestRun),
                targetProfile.runHandler(request, new vscode.CancellationTokenSource().token),
            ])
        )[0];
    }

    suiteSetup(async () => {
        workspaceContext = await globalWorkspaceContextPromise;
    });

    beforeEach(async () => {
        const packageFolder = testAssetUri("defaultPackage");
        const targetFolder = workspaceContext.folders.find(
            folder => folder.folder.path === packageFolder.path
        );
        if (!targetFolder || !targetFolder.testExplorer) {
            throw new Error("Unable to find test explorer");
        }
        testExplorer = targetFolder.testExplorer;

        // Set up the listener before bringing the text explorer in to focus,
        // which starts searching the workspace for tests.
        await waitForTestExplorerReady();
    });

    test("Finds Tests", async function () {
        if (workspaceContext.swiftVersion.isGreaterThanOrEqual(new Version(6, 0, 0))) {
            // 6.0 uses the LSP which returns tests in the order they're declared.
            // Includes swift-testing tests.
            assertTestControllerHierarchy(testExplorer.controller, [
                "PackageTests",
                [
                    "PassingXCTestSuite",
                    ["testPassing()"],
                    "FailingXCTestSuite",
                    ["testFailing()"],
                    "MixedXCTestSuite",
                    ["testPassing()", "testFailing()"],
                    "topLevelTestPassing()",
                    "topLevelTestFailing()",
                    "MixedSwiftTestingSuite",
                    ["testPassing()", "testFailing()", "testDisabled()"],
                ],
            ]);
        } else if (workspaceContext.swiftVersion.isLessThanOrEqual(new Version(5, 10, 0))) {
            // 5.10 uses `swift test list` which returns test alphabetically, without the round brackets.
            // Does not include swift-testing tests.
            assertTestControllerHierarchy(testExplorer.controller, [
                "PackageTests",
                [
                    "FailingXCTestSuite",
                    ["testFailing"],
                    "MixedXCTestSuite",
                    ["testFailing", "testPassing"],
                    "PassingXCTestSuite",
                    ["testPassing"],
                ],
            ]);
        }
    });

    // TODO: Add RunProfileName.coverage once https://github.com/swift-server/vscode-swift/pull/807 is merged.
    [RunProfileName.run].forEach(runProfile => {
        suite(runProfile, () => {
            suite("swift-testing", function () {
                suiteSetup(function () {
                    if (workspaceContext.swiftVersion.isLessThan(new Version(6, 0, 0))) {
                        this.skip();
                    }
                });

                test("Runs passing test", async function () {
                    const testRun = await runTest(
                        testExplorer.controller,
                        runProfile,
                        "PackageTests.topLevelTestPassing()"
                    );

                    assertTestResults(testRun, {
                        passed: ["PackageTests.topLevelTestPassing()"],
                    });
                });

                test("Runs failing test", async function () {
                    const testRun = await runTest(
                        testExplorer.controller,
                        runProfile,
                        "PackageTests.topLevelTestFailing()"
                    );

                    assertTestResults(testRun, {
                        failed: ["PackageTests.topLevelTestFailing()"],
                    });
                });

                test("Runs Suite", async function () {
                    const testRun = await runTest(
                        testExplorer.controller,
                        runProfile,
                        "PackageTests.MixedSwiftTestingSuite"
                    );

                    assertTestResults(testRun, {
                        passed: [
                            "PackageTests.MixedSwiftTestingSuite/testPassing()",
                            "PackageTests.MixedSwiftTestingSuite",
                        ],
                        skipped: ["PackageTests.MixedSwiftTestingSuite/testDisabled()"],
                        failed: ["PackageTests.MixedSwiftTestingSuite/testFailing()"],
                    });
                });
            });

            suite("XCTests", () => {
                test("Runs passing test", async function () {
                    const testRun = await runTest(
                        testExplorer.controller,
                        runProfile,
                        "PackageTests.PassingXCTestSuite/testPassing"
                    );

                    assertTestResults(testRun, {
                        passed: ["PackageTests.PassingXCTestSuite/testPassing"],
                    });
                });

                test("Runs failing test", async function () {
                    const testRun = await runTest(
                        testExplorer.controller,
                        runProfile,
                        "PackageTests.FailingXCTestSuite/testFailing"
                    );

                    assertTestResults(testRun, {
                        failed: ["PackageTests.FailingXCTestSuite/testFailing"],
                    });
                });

                test("Runs Suite", async function () {
                    const testRun = await runTest(
                        testExplorer.controller,
                        runProfile,
                        "PackageTests.MixedXCTestSuite"
                    );

                    assertTestResults(testRun, {
                        passed: ["PackageTests.MixedXCTestSuite/testPassing"],
                        failed: ["PackageTests.MixedXCTestSuite/testFailing"],
                    });
                });
            });
        });
    });
});