export default function createWasmImports({ memory, module, utils }) {
  return {
    env: {
      myUserFunction: (inputNumber) => {
        return inputNumber + 44;
      },
    },
    other: nonexistent
  };
};
