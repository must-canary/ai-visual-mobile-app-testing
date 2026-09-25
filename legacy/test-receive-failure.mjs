import { remote } from "webdriverio";
import fs from "node:fs";

const driver = await remote({
  hostname: "127.0.0.1",
  port: 4723,
  path: "/",
  logLevel: "error",
  capabilities: {
    platformName: "Android",
    "appium:automationName": "UiAutomator2",
    "appium:udid": "emulator-5554",
    "appium:deviceName": "emulator-5554",
    "appium:appPackage": "tech.globalmpc.mpc_mining_app",
    "appium:appActivity":
      "tech.globalmpc.mpc_mining_app.MainActivity",
    "appium:noReset": true,
    "appium:autoGrantPermissions": true
  }
});

try {
  console.log("Session started");

  await driver.saveScreenshot("before-receive-failure.png");

  const receive = await driver.$("~Receive-Changed");
  const exists = await receive.isExisting();

  console.log("Changed locator exists:", exists);

  if (!exists) {
    throw new Error(
      'Traditional automation failed: locator "~Receive-Changed" could not identify the Receive element.'
    );
  }

  await receive.click();

  console.log("Receive click executed");

  await driver.pause(1500);
  await driver.saveScreenshot("after-receive-failure.png");
} catch (error) {
  console.error("TEST FAILED:", error.message);
  process.exitCode = 1;
} finally {
  await driver.deleteSession();
  console.log("Session closed");
}