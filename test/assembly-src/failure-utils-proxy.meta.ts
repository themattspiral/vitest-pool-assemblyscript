import { fails } from './failure-utils.meta';

export function callsAnotherFunctionThatFails(): i32 {
  const value = fails();
  return value;
}