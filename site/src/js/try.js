import { SCENES } from './scenes.js';
import { mountQuick } from './quick.js';
import { $$ } from './dom.js';

$$('[data-mount]').forEach((el) => SCENES[el.dataset.mount](el, {}));
$$('[data-quick]').forEach((el) => mountQuick(el, el.dataset.quick));
