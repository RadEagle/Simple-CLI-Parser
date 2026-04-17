import { Command, CommanderError } from "commander";
import { z } from "zod";

// Define the schema for a task
const TaskSchema = z.object({
    title: z.string().trim().min(1),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    dueDate: z.coerce.date().optional(),
});

// Create a new command
const program = new Command();

program
    .option("-t, --title <title>", "The title of the task")
    .option("-p, --priority <priority>", "The priority of the task")
    .option("-d, --dueDate <dueDate>", "The due date of the task")
    .option("--json", "Output the result in JSON format", false)
    .action((options) => {
        const { title, priority, dueDate, json } = options;
        const result = TaskSchema.safeParse({ title, priority, dueDate });

        if (!result.success) {
            let issues: string[] = [];
            for (const issue of result.error.issues) {
                issues.push(`${issue.path.join(".")}: ${issue.message}`);
            }

            if (json) {
                let jsonDict = {
                    ok: false,
                    issues: issues
                }
                console.error(JSON.stringify(jsonDict, null, 2));
            }
            else {
                console.error(issues.join("\n"));
            }

            process.exit(1);
        }

        const task = result.data;
        let outputStr = "";
        if (task.dueDate) {
            outputStr = `Adding task: ${task.title} with priority ${task.priority} and due date ${task.dueDate.toLocaleDateString("en-CA")}`;
        }
        else {
            outputStr = `Adding task: ${task.title} with priority ${task.priority}`;
        }

        if (json) {
            let jsonDict = {
                ok: true,
                task: result.data
            }
            console.log(JSON.stringify(jsonDict, null, 2));
        }
        else {
            console.log(outputStr);
        }
    });


// Run the program. Override the exit code to 2 if CLI is misused.
program.exitOverride();

try {
    program.parse(process.argv);
}
catch (error) {
    if (error instanceof CommanderError) {
        if (error.code === "commander.helpDisplayed") {
            process.exit(0);
        }
        process.exit(2);
    }
    throw error;
}