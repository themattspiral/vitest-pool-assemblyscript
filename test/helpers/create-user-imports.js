export default function createWasmImports({ memory, module, utils }) {
  return {
    env: {
      myUserFunction: (inputNumber) => {
        return inputNumber + 10;
      }
    },

    customUserEnv: {
      otherFunction: (inputNumber) => {
        return inputNumber * 10;
      },

      parseIntStringFunction: (inputStrPtr) => {
        const str = utils.liftString(inputStrPtr);
        return parseInt(str);
      }
    }
  };
};
