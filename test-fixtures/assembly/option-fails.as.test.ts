import { it, assert, TestOptions, assertEqual, describe } from '../../assembly';
import { add } from '../assembly-src/math';

describe("various test cases using the fails option, [should fail]", ()=> {
  it("should pass normally", () => {
    assertEqual(add(1, 2), 3);
  });
  
  it("should pass with failing assertion when fails option is set", TestOptions.fails(), () => {
    assert(false);
  });
  
  it("should also pass with failing assertion when fails option is set", () => {
    assert(false);
  }, TestOptions.fails());
  
  it.fails("should pass with failing assertion when fails function is used", () => {
    assert(false);
  });
  
  it.fails("should not pass with passing assertion when fails option is set [should fail]", () => {
    assert(true);
  });
  
  it.fails("should pass with failing assertion when fails function is used with options", TestOptions.retry(3), () => {
    assert(false);
  });
  
  it.fails("should pass with failing assertion when fails function is used with options also", () => {
    assert(false);
  }, TestOptions.retry(3));
})
