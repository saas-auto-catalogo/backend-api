import 'dotenv/config';
import './instrument.js';
import { startServer } from './server.js';

const port = parseInt(process.env.PORT || '3333', 10);
const host = process.env.HOST || '0.0.0.0';

void startServer(port, host);
