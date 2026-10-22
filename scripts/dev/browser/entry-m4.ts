// The current build's page for M4: the Beat Box tab (entry.ts), the panel lab (entry-panel.ts) and the one shared message-delivery state, in ONE bundle so the Score and the choke points
// see the same instance (as they do in the plugin). The previous commit's build has no score-first-messages-core.ts, so its page is entry-panel.ts alone.
import './entry.ts';
import './entry-panel.ts';
import { messageDelivery } from '@client/score-first-messages-core.ts';
(window as any).__messageDelivery = messageDelivery;
