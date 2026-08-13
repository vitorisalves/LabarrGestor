import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  isTestMode: boolean;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getCollectionPrefix = () => {
  const store = requestContext.getStore();
  return store?.isTestMode ? 'test_' : '';
};
