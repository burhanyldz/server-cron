import { MongoClient } from 'mongodb';
import { env } from './env.js';

const client = new MongoClient(env.mongoUri);
let connected = false;

export const connectToDatabase = async (): Promise<MongoClient> => {
  if (!connected) {
    await client.connect();
    connected = true;
  }

  return client;
};

export const getDatabase = async () => {
  const mongoClient = await connectToDatabase();
  return mongoClient.db(env.mongoDbName);
};
