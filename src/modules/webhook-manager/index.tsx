import { Extension, ExtensionType } from '@/core/extensions';
import { WebhookManagerUI } from './ui';

export default class WebhookManagerModule extends Extension {
  name = 'WebhookManagerModule';

  type = ExtensionType.CUSTOM;

  render() {
    return WebhookManagerUI;
  }
}
