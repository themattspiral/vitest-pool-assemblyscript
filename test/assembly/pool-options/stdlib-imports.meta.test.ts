/**
 * Console output meta fixture.
 * Exercises each console method to verify output attribution and formatting.
 */

import { test, describe } from "vitest-pool-assemblyscript/assembly";
import { fails } from "../../assembly-src/failure-utils.meta";
import { fibonacciRecursive } from "../../assembly-src/computation-utils";

describe("AssemblyScript console stdlib interface - pool provided functions", () => {
  test("console log is still printed for failed test [should fail]", () => {
    console.log("this is a console log from a test before it fails");
    fails();
  });
  
  test("console assert", () => {
    console.assert(false, "this is a console.assert failure");
  });
  
  test("console error", () => {
    console.error("This is an error!!");
  });
  
  test("console debug", () => {
    console.debug("This is a debug message");
  });
  
  test("console log", () => {
    console.log("this is a log");
  });
  
  test("console info", () => {
    console.info("this is info");
  });
  
  test("console warn", () => {
    console.warn("this is a warning");
  });
  
  test("console time functions", () => {
    console.time();
    fibonacciRecursive(33);
    console.timeLog();
    fibonacciRecursive(34);
    console.timeEnd();
  });
});

describe("AssemblyScript trace stdlib interface - pool provided function", () => {
  test("trace", () => {
    trace("trace marker");
  });
});
