import { remote } from "webdriverio";

const driver = await remote({
  hostname: "127.0.0.1",
  port: 4723,
  path: "/",
  logLevel: "info",
  capabilities: {
    platformName: "Android",
    "appium:automationName": "UiAutomator2",
    "appium:udid": "emulator-5554",
    "appium:deviceName": "emulator-5554",
    "appium:appPackage": "tech.globalmpc.mpc_mining_app",
    "appium:appActivity":
      "tech.globalmpc.mpc_mining_app.MainActivity",
    "appium:noReset": true,
    "appium:autoGrantPermissions": true,
    "appium:newCommandTimeout": 120,
  },
});

console.log("Appium session created");

const size = await driver.getWindowSize();
console.log("Screen size:", size);

const screenshot = await driver.takeScreenshot();
console.log("Screenshot captured:", screenshot.length, "characters");

await driver.pause(3000);

await driver.deleteSession();

console.log("Appium session closed");