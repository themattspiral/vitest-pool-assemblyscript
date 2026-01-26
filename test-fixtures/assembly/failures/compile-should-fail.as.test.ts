import { test } from '../../../assembly';

test("compilation failure", () => {
  //@ts-ignore
  return doesNotExist;
});
