import Tester from "tester";

const config = await Tester.config();

console.log(":::::::::::::::::::::::::::::::::::::");
console.log("");
console.log(`transport tester — project: "${config.project.name}"`);
console.log("");
console.log(`Hasura target: "${config.hasura.url}"`);
console.log("");
console.log("Required .env vars: see .env.example");
console.log("");
console.log("Run: npm test");
console.log("");
console.log(":::::::::::::::::::::::::::::::::::::");
