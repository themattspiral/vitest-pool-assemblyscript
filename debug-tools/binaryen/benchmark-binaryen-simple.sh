#!/bin/bash
# Simple benchmark - run tests multiple times and extract Binaryen timing

echo "Benchmarking Binaryen instrumentation overhead"
echo "=============================================="
echo ""
echo "Running 5 iterations to measure overhead..."
echo ""

for i in {1..5}; do
  echo "Run $i:"
  npm test 2>&1 | grep -E '\[Binaryen\] Instrumentation complete in' | sed 's/\[Binaryen\] Instrumentation complete in /  /'
  echo ""
done

echo "=============================================="
echo "Note: First run per file may be slower due to JIT warmup"
echo "Success criterion: <100ms per file"
