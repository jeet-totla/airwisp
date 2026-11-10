import '@fontsource-variable/bricolage-grotesque'
import '../styles.css'
import { runHost } from './host'
import { runPhone } from './phone'

const q = new URLSearchParams(location.search)
const local = q.get('local') === '1'
if (q.has('join') || q.get('phone') === '1') runPhone(q.get('join'), local)
else runHost({ sim: q.get('sim') === '1', local })
