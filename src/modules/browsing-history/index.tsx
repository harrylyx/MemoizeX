import { Extension, ExtensionType } from '@/core/extensions';
import { BrowsingHistoryInterceptor } from './api';
import { BrowsingHistoryUI } from './ui';

export default class BrowsingHistoryModule extends Extension {
  name = 'BrowsingHistoryModule';

  type = ExtensionType.CUSTOM;

  intercept() {
    return BrowsingHistoryInterceptor;
  }

  render() {
    return BrowsingHistoryUI;
  }
}
