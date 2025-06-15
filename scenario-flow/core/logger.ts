// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",

  // Text colors
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Background colors
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
};

/**
 * Information about a scenario step for logging.
 * @internal
 */
export interface StepInfo {
  /** Step name */
  name: string;
  /** Start time in milliseconds */
  startTime: number;
  /** End time in milliseconds */
  endTime?: number;
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * Information about a scenario for logging.
 * @internal
 */
export interface ScenarioInfo {
  /** Scenario name */
  name: string;
  /** File path if applicable */
  filePath?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  steps: StepInfo[];
  success: boolean;
}

/**
 * Logger for scenario execution with colored console output.
 * Provides automatic logging of HTTP requests, responses, and timing.
 */
export class ScenarioLogger {
  private currentScenario: ScenarioInfo | null = null;
  private currentStep: StepInfo | null = null;

  /**
   * Format duration in milliseconds to human readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Format timestamp to HH:MM:SS.mmm
   */
  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  /**
   * Start a new scenario
   */
  startScenario(name: string, filePath?: string): void {
    const startTime = performance.now();
    this.currentScenario = {
      name,
      filePath,
      startTime,
      steps: [],
      success: true,
    };

    console.log(
      "\n" + colors.bright + colors.cyan + "=".repeat(60) + colors.reset,
    );
    console.log(
      colors.bright + colors.cyan + "🎯 SCENARIO: " + colors.white + name +
        colors.reset,
    );
    console.log(colors.bright + colors.cyan + "=".repeat(60) + colors.reset);

    if (filePath) {
      console.log(colors.gray + "📁 File: " + filePath + colors.reset);
    }
    console.log(
      colors.gray + "⏰ Started: " + this.formatTime(Date.now()) + colors.reset,
    );
    console.log("");
  }

  /**
   * Start a new step
   */
  startStep(name: string): void {
    if (!this.currentScenario) {
      throw new Error("Cannot start step without an active scenario");
    }

    const startTime = performance.now();
    this.currentStep = {
      name,
      startTime,
    };

    console.log(colors.blue + "  " + "─".repeat(40) + colors.reset);
    console.log(
      colors.bright + colors.blue + "  📋 STEP: " + colors.white + name +
        colors.reset,
    );
    console.log(colors.blue + "  " + "─".repeat(40) + colors.reset);
  }

  /**
   * Log HTTP request information
   */
  logRequest(method: string, url: string, body?: string): void {
    console.log(
      colors.cyan + "  🌐 " + colors.bright + method + colors.reset +
        colors.cyan + " " + url + colors.reset,
    );
    if (body) {
      // Truncate long bodies
      const displayBody = body.length > 200
        ? body.substring(0, 200) + "..."
        : body;
      console.log(colors.gray + "  📤 " + displayBody + colors.reset);
    }
  }

  /**
   * Log HTTP response information
   */
  logResponse(
    status: number,
    statusText: string,
    duration: number,
    body?: string,
  ): void {
    const statusColor = status >= 200 && status < 300
      ? colors.green
      : colors.red;
    const statusIcon = status >= 200 && status < 300 ? "✅" : "❌";

    console.log(
      statusColor + `  ${statusIcon} ${status} ${statusText}` + colors.reset +
        colors.gray + ` (${this.formatDuration(duration)})` + colors.reset,
    );

    if (body) {
      // Truncate long responses
      const displayBody = body.length > 300
        ? body.substring(0, 300) + "..."
        : body;
      console.log(colors.gray + "  📥 " + displayBody + colors.reset);
    }
  }

  /**
   * Log general information
   */
  logInfo(message: string): void {
    console.log(colors.blue + "  ℹ️  " + message + colors.reset);
  }

  /**
   * Log success message
   */
  logSuccess(message: string): void {
    console.log(colors.green + "  ✅ " + message + colors.reset);
  }

  /**
   * Log error message
   */
  logError(message: string): void {
    console.log(colors.red + "  ❌ " + message + colors.reset);
    if (this.currentScenario) {
      this.currentScenario.success = false;
    }
  }

  /**
   * End the current step
   */
  endStep(): void {
    if (!this.currentStep || !this.currentScenario) {
      return;
    }

    const endTime = performance.now();
    const duration = endTime - this.currentStep.startTime;

    this.currentStep.endTime = endTime;
    this.currentStep.duration = duration;

    this.currentScenario.steps.push(this.currentStep);

    console.log(
      colors.gray + "  ⏱️  Step completed in: " +
        this.formatDuration(duration) + colors.reset,
    );
    console.log("");

    this.currentStep = null;
  }

  /**
   * End the current scenario
   */
  endScenario(): ScenarioInfo | null {
    if (!this.currentScenario) {
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - this.currentScenario.startTime;

    this.currentScenario.endTime = endTime;
    this.currentScenario.duration = duration;

    const successIcon = this.currentScenario.success ? "✅" : "❌";
    const successColor = this.currentScenario.success
      ? colors.green
      : colors.red;
    const statusText = this.currentScenario.success ? "COMPLETED" : "FAILED";

    console.log(colors.bright + colors.cyan + "=".repeat(60) + colors.reset);
    console.log(
      colors.bright + successColor + `${successIcon} SCENARIO ${statusText}: ` +
        colors.white + this.currentScenario.name + colors.reset,
    );
    console.log(
      colors.gray + `⏱️  Total: ${this.formatDuration(duration)} | ` +
        `Steps: ${this.currentScenario.steps.length} | ` +
        `${this.currentScenario.success ? "All successful" : "Some failed"}` +
        colors.reset,
    );
    console.log(colors.bright + colors.cyan + "=".repeat(60) + colors.reset);
    console.log("");

    const result = this.currentScenario;
    this.currentScenario = null;
    return result;
  }

  /**
   * Log CLI execution summary
   */
  logExecutionSummary(
    totalFiles: number,
    successCount: number,
    totalDuration: number,
  ): void {
    const allSuccess = successCount === totalFiles;
    const successColor = allSuccess ? colors.green : colors.red;
    const icon = allSuccess ? "🎉" : "⚠️";

    console.log(
      "\n" + colors.bright + colors.magenta + "=".repeat(60) + colors.reset,
    );
    console.log(
      colors.bright + colors.magenta + "📊 EXECUTION SUMMARY" + colors.reset,
    );
    console.log(colors.bright + colors.magenta + "=".repeat(60) + colors.reset);
    console.log(
      successColor +
        `${icon} ${successCount}/${totalFiles} scenarios executed successfully` +
        colors.reset,
    );
    console.log(
      colors.gray +
        `⏱️  Total execution time: ${this.formatDuration(totalDuration)}` +
        colors.reset,
    );
    console.log(colors.bright + colors.magenta + "=".repeat(60) + colors.reset);
  }
}

/**
 * Global logger instance for scenario execution.
 * Provides automatic request/response logging with timing and formatting.
 */
export const logger: ScenarioLogger = new ScenarioLogger();
