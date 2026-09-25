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
  const png = await driver.takeScreenshot();
  fs.writeFileSync("visual-recovery-screen.png", Buffer.from(png, "base64"));

  console.log("Screenshot saved: visual-recovery-screen.png");

  await driver.deleteSession();
} catch (error) {
  console.error("Visual recovery setup failed:", error.message);
  await driver.deleteSession();
  process.exitCode = 1;
}