/** Stable, machine-readable error codes returned in `error.code`. */
export const ERROR_CODES = {
  // generic
  VALIDATION_ERROR: { status: 422, message: 'Request validation failed.' },
  BAD_REQUEST: { status: 400, message: 'Bad request.' },
  NOT_FOUND: { status: 404, message: 'Resource not found.' },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests, please try again later.' },
  CONFLICT: { status: 409, message: 'The request conflicts with the current state.' },
  SERVICE_BUSY: {
    status: 503,
    message: 'The server is busy processing other requests. Please retry in a moment.',
  },

  // auth / authz
  UNAUTHENTICATED: { status: 401, message: 'Authentication is required.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Invalid email or password.' },
  INVALID_TOKEN: { status: 401, message: 'Token is invalid or expired.' },
  SESSION_EXPIRED: { status: 401, message: 'Session has expired, please log in again.' },
  ACCOUNT_INACTIVE: { status: 403, message: 'This account has been deactivated.' },
  FORBIDDEN: { status: 403, message: 'You do not have permission to perform this action.' },
  EMAIL_ALREADY_EXISTS: { status: 409, message: 'An account with this email already exists.' },
  SETUP_ALREADY_COMPLETE: { status: 409, message: 'A SUPER_ADMIN account already exists.' },

  // catalogue
  CATEGORY_NOT_FOUND: { status: 404, message: 'Category not found.' },
  CATEGORY_NAME_EXISTS: { status: 409, message: 'A category with this name already exists.' },
  CATEGORY_HAS_PRODUCTS: { status: 409, message: 'Category still has products attached.' },
  PRODUCT_NOT_FOUND: { status: 404, message: 'Product not found.' },
  PRODUCT_INACTIVE: { status: 409, message: 'This product is not currently available.' },
  PRODUCT_HAS_VARIANTS: { status: 409, message: 'Product still has variants attached.' },
  VARIANT_NOT_FOUND: { status: 404, message: 'Product variant not found.' },
  VARIANT_INACTIVE: { status: 409, message: 'This product variant is not currently available.' },
  DUPLICATE_SKU: { status: 409, message: 'This SKU is already in use.' },
  DUPLICATE_BARCODE: { status: 409, message: 'This barcode is already in use.' },
  DUPLICATE_VARIANT: {
    status: 409,
    message: 'This colour and size combination already exists for the product.',
  },
  IMAGE_NOT_FOUND: { status: 404, message: 'Product image not found.' },

  // inventory
  INSUFFICIENT_STOCK: { status: 409, message: 'Not enough stock for this product variant.' },
  INVENTORY_NOT_FOUND: { status: 404, message: 'Inventory record not found for this variant.' },
  INVALID_ADJUSTMENT: { status: 422, message: 'Invalid inventory adjustment.' },

  // suppliers / purchases
  SUPPLIER_NOT_FOUND: { status: 404, message: 'Supplier not found.' },
  SUPPLIER_INACTIVE: { status: 409, message: 'This supplier is inactive.' },
  SUPPLIER_HAS_PURCHASES: { status: 409, message: 'Supplier still has purchases attached.' },
  PURCHASE_NOT_FOUND: { status: 404, message: 'Purchase not found.' },
  PURCHASE_ALREADY_RECEIVED: { status: 409, message: 'This purchase has already been received.' },
  PURCHASE_NOT_DRAFT: { status: 409, message: 'Only draft purchases can be modified.' },
  PURCHASE_CANCELLED: { status: 409, message: 'This purchase has been cancelled.' },

  // orders
  ORDER_NOT_FOUND: { status: 404, message: 'Order not found.' },
  EMPTY_ORDER: { status: 422, message: 'An order must contain at least one item.' },
  INVALID_STATUS_TRANSITION: { status: 409, message: 'This order status change is not allowed.' },
  ORDER_NOT_CANCELLABLE: { status: 409, message: 'This order can no longer be cancelled.' },
  ORDER_ALREADY_COMPLETED: { status: 409, message: 'This order has already been completed.' },
  ORDER_NOT_PENDING: { status: 409, message: 'Only pending orders can be completed.' },
  CANCEL_WINDOW_EXPIRED: { status: 409, message: 'The cancellation window for this order has passed.' },
  DISCOUNT_TOO_LARGE: { status: 422, message: 'Discount cannot exceed the order subtotal.' },
  CART_EMPTY: { status: 422, message: 'Your cart is empty.' },

  // returns
  RETURN_NOT_FOUND: { status: 404, message: 'Return not found.' },
  ORDER_NOT_RETURNABLE: { status: 409, message: 'This order is not eligible for returns.' },
  INVALID_RETURN_QUANTITY: {
    status: 422,
    message: 'Return quantity exceeds the quantity eligible for return.',
  },
  ITEM_NOT_IN_ORDER: { status: 422, message: 'This variant was not part of the referenced order.' },
  RETURN_ALREADY_PROCESSED: { status: 409, message: 'This return has already been processed.' },
  RETURN_WINDOW_EXPIRED: { status: 409, message: 'The return window for this order has passed.' },

  // customers
  CUSTOMER_NOT_FOUND: { status: 404, message: 'Customer not found.' },
  CANNOT_MODIFY_SELF: { status: 409, message: 'You cannot perform this action on your own account.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
