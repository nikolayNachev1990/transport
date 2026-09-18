import { createBroker } from "@transport/core/broker";
import loadBrokerConfig from "./config/broker.mjs";
import { createKafkaAdmin } from "./kafkaAdmin.mjs";

const brokerConfig = await loadBrokerConfig();

export const broker = await createBroker(brokerConfig);
export const kafkaAdmin = await createKafkaAdmin(brokerConfig.brokers, brokerConfig.schema);
