function overflow(inputNumber) {
  return 1 + overflow(inputNumber);
}

export default function createWasmImports({ memory, module, utils }) {
  return {
    env: {
      myUserFunction: (inputNumber) => {
        return inputNumber + 10;
      },

      failingUserFunction: (inputNumber) => {
        // throws RangeError in JS, which crashes WASM (no abort handler)
        const arr = new Array(-1);
        return arr[0] + inputNumber;
      },
      
      failingUserFunctionNonexistantRef: (inputNumber) => {
        return inputNumber + nonexistent;
      },
      
      failingUserFunctionStackOverflow: (inputNumber) => {
        return overflow(inputNumber);
      }
    },

    customUserModule: {
      otherFunction: (inputNumber) => {
        return inputNumber * 10;
      },
    },

    'user-import-wrapper': {
      parseIntStringFunction: (inputStrPtr) => {
        const str = utils.liftString(inputStrPtr);
        return parseInt(str);
      }
    }
  };
};
