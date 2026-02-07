import { CommonModuleUI } from '@/components/module-ui';
import { Extension, ExtensionType } from '@/core/extensions';
import { BrowsingHistoryInterceptor } from './api';

export default class BrowsingHistoryModule extends Extension {
  name = 'BrowsingHistoryModule';

  type = ExtensionType.TWEET;

  intercept() {
    return BrowsingHistoryInterceptor;
  }

  render() {
    return CommonModuleUI;
  }
}
