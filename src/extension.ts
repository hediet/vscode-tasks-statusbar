import * as vscode from 'vscode';
import { getAnonymousCommand } from './StatusBarHelper';
import { DisposableComponent } from "@hediet/std/disposable";

class TaskStatusBarController extends DisposableComponent {
	private readonly startCommand: string;
	private readonly killCommand: string;
	private readonly statusBarItem: vscode.StatusBarItem;

	constructor(task: vscode.Task, idx: number, private readonly name: string) {
		super();

		const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -0 + idx);
		this.statusBarItem = item;

		const startCommand = getAnonymousCommand(async () => {
			await vscode.tasks.executeTask(task);
		});
		this.startCommand = startCommand.command;
		this.addDisposable(startCommand.disposable);

		const killCommand = getAnonymousCommand(async () => {
			const e = vscode.tasks.taskExecutions.find(e => e.task.name === task.name);
			if (e) {
				e.terminate();
			}
		});
		this.killCommand = killCommand.command;
		this.addDisposable(killCommand.disposable);

		const isRunning = vscode.tasks.taskExecutions.some(e => e.task.name === task.name);
		if (isRunning) {
			this.started();
		} else {
			this.ended();
		}
		item.show();
	}

	public started(): void {
		this.statusBarItem.command = this.killCommand;
		this.statusBarItem.text = `$(primitive-square) ${this.name}`;
	}

	public ended(): void {
		this.statusBarItem.command = this.startCommand;
		this.statusBarItem.text = `$(play) ${this.name}`;
	}

	public dispose() {
		super.dispose();
		this.statusBarItem.hide();
		this.statusBarItem.dispose();
	}
}

const taskLabelFilterKey = "tasksStatusbar.taskLabelFilter";
const nameTemplateKey = "tasksStatusbar.nameTemplate";

class Extension extends DisposableComponent {
	private taskLabelFilter!: RegExp;
	private nameTemplate: string|null = null;

	private taskBarEntries = new Map<string, TaskStatusBarController>();

	constructor() {
		super();

		this.addDisposable(vscode.commands.registerCommand("tasksStatusbar.reload", () => {
			this.reload();
		}));

		this.addDisposable(vscode.tasks.onDidStartTask(e => {
			const entry = this.taskBarEntries.get(e.execution.task.name);
			if (!entry) { return; }

			entry.started();
		}));

		this.addDisposable(vscode.tasks.onDidEndTask(e => {
			const entry = this.taskBarEntries.get(e.execution.task.name);
			if (!entry) { return; }

			entry.ended();
		}));

		vscode.workspace.onDidChangeConfiguration(() => {
			this.reload();
		});

		this.reload();
	}

	private reload() {
		this.updateSettings();
		this.updateSync();
	}

	private updateSettings() {
		const c = vscode.workspace.getConfiguration();
		this.taskLabelFilter = new RegExp(c.get<string>(taskLabelFilterKey) || "dev|watch");
		this.nameTemplate = c.get<string>(nameTemplateKey) || null;
	}

	private updateSync() {
		this.update().catch(e => console.error(e));
	}

	private async update(): Promise<void> {
		let tasks = await vscode.tasks.fetchTasks();

		for (const e of this.taskBarEntries.values()) {
			e.dispose();
		}
		this.taskBarEntries.clear();

		let idx = 0;
		for (const task of tasks) {
			idx++;
			const e = this.taskLabelFilter.exec(task.name);
			if (!e) { continue; }
			let name = task.name;
			if (this.nameTemplate) {
				name = name.replace(this.taskLabelFilter, this.nameTemplate);
			}

			const controller = new TaskStatusBarController(task, idx, name);
			this.taskBarEntries.set(task.name, controller);
		}
	}

	public dispose() {
		super.dispose();

		for (const e of this.taskBarEntries.values()) {
			e.dispose();
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	const e = new Extension();
	context.subscriptions.push(e);
}

export function deactivate() {}
