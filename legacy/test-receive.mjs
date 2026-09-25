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

  await driver.saveScreenshot("before-receive.png");

  const receive = await driver.$("~Receive");

  console.log("Receive found:", await receive.isDisplayed());

  // Receive bounds from Appium UI hierarchy:
  // [53,835][512,950]
  const x = 283;
  const y = 893;

  console.log("Click coordinates:", { x, y });

  await driver.execute("mobile: clickGesture", {
    x,
    y
  });

  console.log("Receive click executed");

  await driver.pause(1500);

  await driver.saveScreenshot("after-receive.png");

  console.log("Screenshots saved");
} catch (error) {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
} finally {
  await driver.deleteSession();
  console.log("Session closed");
}