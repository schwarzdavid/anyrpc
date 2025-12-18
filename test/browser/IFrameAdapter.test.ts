import { describe, it } from 'vitest'
import { setupIFramePage } from './fixtures/iframe/setupIFramePage'

describe('iFrameAdapter', () => {
    it('should establish a connection', async () => {
        await setupIFramePage()
    })
})
