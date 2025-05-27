/**
 * Interface for tracking bulk operation results
 */
export interface BulkOperationResult {
  totalOperations: number;
  successful: number;
  failed: number;
  errors: Array<{ id: string | number; error: string }>;
}

/**
 * Execute a bulk operation using Promise.allSettled for simple parallel execution
 */
export async function executeBulkOperation<T>(
  items: T[],
  operation: (item: T) => Promise<any>,
  getItemId: (item: T, index: number) => string | number = (_, index) => index
): Promise<BulkOperationResult> {
  const results = await Promise.allSettled(items.map((item) => operation(item)));

  const result: BulkOperationResult = {
    totalOperations: items.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  results.forEach((promiseResult, index) => {
    if (promiseResult.status === 'fulfilled') {
      result.successful++;
    } else {
      result.failed++;
      result.errors.push({
        id: getItemId(items[index], index),
        error:
          promiseResult.reason instanceof Error
            ? promiseResult.reason.message
            : String(promiseResult.reason),
      });
    }
  });

  return result;
}

/**
 * Format bulk operation result for display
 */
export function formatBulkOperationResult(
  result: BulkOperationResult,
  operationName: string,
  showErrors: boolean = true
): string {
  let message = `${operationName} completed:\n`;
  message += `- Total operations: ${result.totalOperations}\n`;
  message += `- Successful: ${result.successful}\n`;
  message += `- Failed: ${result.failed}`;

  if (showErrors && result.errors.length > 0) {
    message += '\n\nErrors:\n';
    result.errors.slice(0, 10).forEach((error) => {
      message += `- ID ${error.id}: ${error.error}\n`;
    });

    if (result.errors.length > 10) {
      message += `... and ${result.errors.length - 10} more errors`;
    }
  }

  return message;
}
