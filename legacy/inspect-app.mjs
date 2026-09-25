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
    "appium:appActivity": "tech.globalmpc.mpc_mining_app.MainActivity",
    "appium:noReset": true,
    "appium:autoGrantPermissions": true,
  },
});

const source = await driver.getPageSource();
fs.writeFileSync("page-source.xml", source, "utf8");

console.log("Page source saved to page-source.xml");

await driver.deleteSession();