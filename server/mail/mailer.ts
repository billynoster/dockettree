/**
 * SMTP delivery. Optional by design: with no SMTP host configured the mailer reports
 * `configured: false` and the app leaves messages queued instead of claiming delivery.
 */
import nodemailer, { type Transporter } from 'nodemailer'
import type { SmtpConfig } from '../config'

export interface OutgoingMessage {
  to: string
  toName: string
  subject: string
  body: string
}

export interface Mailer {
  readonly configured: boolean
  /** Human-readable reason shown in the UI when delivery is unavailable. */
  readonly unavailableReason: string | null
  send(message: OutgoingMessage): Promise<void>
}

export function createMailer(config: SmtpConfig | null): Mailer {
  if (!config) {
    return {
      configured: false,
      unavailableReason:
        'Email delivery is not configured on this server, so messages stay queued. Set SMTP_HOST to enable sending.',
      async send() {
        throw new Error('SMTP is not configured.')
      },
    }
  }

  let transporter: Transporter | null = null
  const transport = () => {
    transporter ??= nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password ?? '' } : undefined,
    })
    return transporter
  }

  return {
    configured: true,
    unavailableReason: null,
    async send(message) {
      await transport().sendMail({
        from: config.from,
        to: message.toName ? `"${message.toName.replace(/"/g, '')}" <${message.to}>` : message.to,
        subject: message.subject,
        text: message.body,
      })
    },
  }
}

/** Collects messages in memory instead of sending them. Used by tests. */
export function createCapturingMailer(options: { failWith?: string } = {}): Mailer & {
  sent: OutgoingMessage[]
} {
  const sent: OutgoingMessage[] = []
  return {
    configured: true,
    unavailableReason: null,
    sent,
    async send(message) {
      if (options.failWith) throw new Error(options.failWith)
      sent.push(message)
    },
  }
}
