function overflow(inputNumber) {
  return 1 + overflow(inputNumber);
}

export default function createWasmImports({ memory, module, utils }) {
  return {
    customUserModule: {
      otherFunction: (inputNumber) => {
        return inputNumber * 10;
      },
    }
  };
};
