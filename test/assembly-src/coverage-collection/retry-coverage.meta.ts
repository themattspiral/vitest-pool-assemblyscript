export function retryTarget(): i32 {
  return 10;
}

export function retryHelper(): i32 {
  return 20;
}

let executions: i32 = 0;

export function returnsTrueOnThirdExecution(): bool {
  executions++;
  
  return executions >= 3;
}
